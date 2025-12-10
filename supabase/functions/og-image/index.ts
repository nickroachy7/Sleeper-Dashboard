import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate Open Graph HTML for article link previews
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const articleId = url.searchParams.get("id");
    
    if (!articleId) {
      return new Response("Missing article ID", { status: 400 });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch article from database
    const { data: article, error } = await supabase
      .from("articles")
      .select("id, title, subtitle, content, article_type, embedded_data")
      .eq("id", articleId)
      .single();

    if (error || !article) {
      return new Response("Article not found", { status: 404 });
    }

    // Extract image URL from embedded_data
    const imageUrl = article.embedded_data?.image_url || 
      "https://ieviegvkitwwtttgrcso.supabase.co/storage/v1/object/public/assets/default-og-image.png";
    
    // Get description from subtitle or first part of content
    const description = article.subtitle || 
      article.content?.substring(0, 160).replace(/\*\*/g, "").replace(/\n/g, " ") + "..." ||
      "Fantasy Football News and Analysis";

    // Determine site name based on article type
    const siteName = article.article_type === "nfl_news" 
      ? "NFL Fantasy News" 
      : "Sleeper League Dashboard";

    // The actual dashboard URL where the article lives
    const dashboardUrl = Deno.env.get("DASHBOARD_URL") || "https://sleeper-league-dashboard-production.up.railway.app";
    const articleUrl = `${dashboardUrl}/article/${article.id}`;

    // Generate HTML with Open Graph meta tags
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Primary Meta Tags -->
  <title>${escapeHtml(article.title)}</title>
  <meta name="title" content="${escapeHtml(article.title)}">
  <meta name="description" content="${escapeHtml(description)}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="${articleUrl}">
  <meta property="og:title" content="${escapeHtml(article.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:site_name" content="${siteName}">
  
  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:url" content="${articleUrl}">
  <meta property="twitter:title" content="${escapeHtml(article.title)}">
  <meta property="twitter:description" content="${escapeHtml(description)}">
  <meta property="twitter:image" content="${imageUrl}">
  
  <!-- Redirect to actual article page -->
  <meta http-equiv="refresh" content="0; url=${articleUrl}">
  <link rel="canonical" href="${articleUrl}">
</head>
<body>
  <p>Redirecting to <a href="${articleUrl}">${escapeHtml(article.title)}</a>...</p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        ...corsHeaders,
      },
    });

  } catch (error) {
    console.error("Error generating OG tags:", error);
    return new Response("Internal server error", { status: 500 });
  }
});

// Escape HTML to prevent XSS
function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
