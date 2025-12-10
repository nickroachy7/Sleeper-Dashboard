/**
 * Edge Function: generate-daily-articles
 * 
 * Generates 15 articles for daily consumption.
 * Deletes old articles and creates fresh ones.
 * Can be triggered by a cron job or manual request.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Reduced to 5 articles to avoid timeout (each takes ~30 seconds)
const ARTICLES_PER_DAY = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today's date at midnight for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if we already have articles generated today
    const { data: existingArticles, error: checkError } = await supabase
      .from("articles")
      .select("id, generated_at")
      .gte("generated_at", today.toISOString())
      .limit(1);

    if (checkError) {
      throw new Error(`Failed to check existing articles: ${checkError.message}`);
    }

    // If we already have articles from today, return them
    if (existingArticles && existingArticles.length > 0) {
      const { data: todaysArticles } = await supabase
        .from("articles")
        .select("*")
        .gte("generated_at", today.toISOString())
        .order("generated_at", { ascending: false });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Articles already generated for today",
          articles: todaysArticles || [],
          count: todaysArticles?.length || 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Delete old articles (older than today)
    const { error: deleteError } = await supabase
      .from("articles")
      .delete()
      .lt("generated_at", today.toISOString());

    if (deleteError) {
      console.error("Error deleting old articles:", deleteError);
    }

    // Story types to rotate through for variety
    const storyTypeRotation = [
      "power_rankings",
      "trade_analysis",
      "contender",
      "rebuild",
      "underdog",
      "hot_take",
      "standings_analysis",
      "trade_recap",
      "rivalry",
      "overrated",
      "unlucky",
      "dynasty_value",
      "roster_breakdown",
      "weekly_preview",
      null, // Let AI pick freely
    ];

    // Track what we've already used to avoid duplicates
    const usedTradeIds: string[] = [];
    const usedStoryTypes: string[] = [];
    const usedTeams: string[] = [];

    // Generate new articles with diversity tracking
    const generatedArticles = [];
    const errors = [];

    for (let i = 0; i < ARTICLES_PER_DAY; i++) {
      try {
        // Get forced story type from rotation, or null for free pick
        const forcedStoryType = storyTypeRotation[i % storyTypeRotation.length];
        
        // Build exclusions based on what we've already generated
        const exclusions = {
          excludeTradeIds: usedTradeIds.length > 0 ? [...usedTradeIds] : undefined,
          excludeStoryTypes: usedStoryTypes.length > 0 ? [...usedStoryTypes] : undefined,
          excludeTeams: usedTeams.length > 3 ? usedTeams.slice(-5) : undefined, // Only exclude last 5 featured teams
          forcedStoryType: forcedStoryType || undefined,
        };

        console.log(`Generating article ${i + 1}/${ARTICLES_PER_DAY}...`);
        
        // Call the existing generate function with exclusions
        const response = await fetch(
          `${supabaseUrl}/functions/v1/generate-league-article`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ 
              skipSave: false,
              ...exclusions,
            }),
          }
        );

        const responseText = await response.text();
        
        if (response.ok) {
          try {
            const result = JSON.parse(responseText);
            if (result.success && result.article) {
              generatedArticles.push(result.article);
              console.log(`Article ${i + 1} generated: "${result.article.title}"`);
              
              // Track what was used for future exclusions
              if (result.usedTradeIds) {
                usedTradeIds.push(...result.usedTradeIds);
              }
              if (result.usedStoryType && !usedStoryTypes.includes(result.usedStoryType)) {
                usedStoryTypes.push(result.usedStoryType);
              }
              if (result.usedTeams) {
                usedTeams.push(...result.usedTeams);
              }
            } else {
              console.error(`Article ${i + 1} returned success but no article:`, result);
              errors.push(`Article ${i + 1}: No article in response`);
            }
          } catch (parseError) {
            console.error(`Article ${i + 1} JSON parse error:`, parseError);
            errors.push(`Article ${i + 1}: JSON parse error`);
          }
        } else {
          console.error(`Article ${i + 1} failed (${response.status}):`, responseText.slice(0, 500));
          errors.push(`Article ${i + 1}: HTTP ${response.status}`);
        }
      } catch (error) {
        console.error(`Article ${i + 1} exception:`, error);
        errors.push(`Article ${i + 1}: ${error}`);
      }

      // Small delay between generations to avoid rate limits
      if (i < ARTICLES_PER_DAY - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`Generated ${generatedArticles.length} articles with story types: ${usedStoryTypes.join(", ")}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${generatedArticles.length} diverse articles`,
        articles: generatedArticles,
        count: generatedArticles.length,
        storyTypes: usedStoryTypes,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in generate-daily-articles:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
