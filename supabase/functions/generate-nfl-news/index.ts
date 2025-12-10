/**
 * Edge Function: generate-nfl-news
 * 
 * Generates AI-powered NFL fantasy news articles from RSS feeds.
 * Runs once daily at 7am via cron job (same as league news).
 * Fetches latest NFL fantasy news, then uses AI to write engaging articles.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NFL_NEWS_TO_GENERATE = 15;

// RSS Feeds for NFL Fantasy News
// CBS Sports is listed first as it reliably provides images via enclosure tags
const RSS_FEEDS = [
  {
    name: "CBS Sports NFL",
    url: "https://www.cbssports.com/rss/headlines/nfl/",
    hasReliableImages: true,
  },
  {
    name: "ESPN Fantasy Football",
    url: "https://www.espn.com/espn/rss/nfl/news",
    hasReliableImages: false,
  },
  {
    name: "NFL News",
    url: "https://www.nfl.com/rss/rsslanding?searchString=home",
    hasReliableImages: false,
  },
  {
    name: "Rotoworld Player News",
    url: "https://www.rotoworld.com/rss/feed/nfl-player-news",
    hasReliableImages: false,
  },
  {
    name: "Yahoo Fantasy Sports",
    url: "https://sports.yahoo.com/nfl/rss.xml",
    hasReliableImages: false,
  },
];

// Fallback news topics if RSS feeds fail
const FALLBACK_TOPICS = [
  { title: "Weekly Fantasy Football Waiver Wire Targets", category: "waiver_wire" },
  { title: "Top Fantasy Performers This Week", category: "performance" },
  { title: "Injury Updates Impact on Fantasy Football", category: "injury" },
  { title: "Emerging Players to Watch", category: "breakout" },
  { title: "Trade Value Fluctuations in Fantasy Football", category: "trade_value" },
];

interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  imageUrl: string | null;
}

interface NewsStory {
  title: string;
  summary: string;
  source: string;
  category: string;
  imageUrl: string | null;
}

// Validate that a URL is likely an actual image
function isValidImageUrl(url: string | null): boolean {
  if (!url) return false;
  
  // Must be https or http
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  
  // Filter out tracking pixels and non-image URLs
  if (url.includes('xiti') || url.includes('hit.') || url.includes('beacon') || url.includes('tracking')) return false;
  if (url.includes('?s=') && url.includes('&p=')) return false; // Analytics URLs
  
  // Check for common image extensions or image CDN patterns
  const imagePatterns = [
    /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i,
    /\/image\//i,
    /\/images\//i,
    /\/media\//i,
    /cloudinary/i,
    /imgix/i,
    /cdn.*\.(jpg|jpeg|png|gif|webp)/i,
    /zenfs\.com/i,
    /s3\.amazonaws\.com.*\.(jpg|jpeg|png|gif|webp)/i,
    /sportshub\.cbsistatic\.com/i,  // CBS Sports CDN
    /cbssports\.com.*\.(jpg|jpeg|png|gif|webp)/i,  // CBS Sports images
  ];
  
  return imagePatterns.some(pattern => pattern.test(url));
}

// Simple XML parser for RSS feeds
function parseRSSXML(xml: string, sourceName: string): RSSItem[] {
  const items: RSSItem[] = [];
  
  // Match all <item> blocks
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];
    
    // Extract fields with simple regex
    const titleMatch = itemContent.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const descMatch = itemContent.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const linkMatch = itemContent.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const pubDateMatch = itemContent.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    
    // Extract image URL from various RSS image formats
    let imageUrl: string | null = null;
    
    // Try media:content (most common for news RSS)
    const mediaContentMatch = itemContent.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i);
    if (mediaContentMatch) {
      imageUrl = mediaContentMatch[1];
    }
    
    // Try media:thumbnail
    if (!imageUrl) {
      const mediaThumbnailMatch = itemContent.match(/<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i);
      if (mediaThumbnailMatch) {
        imageUrl = mediaThumbnailMatch[1];
      }
    }
    
    // Try enclosure (common for podcasts and some news feeds like CBS Sports)
    if (!imageUrl) {
      // Try matching enclosure with url attribute (flexible order)
      const enclosureUrlMatch = itemContent.match(/<enclosure[^>]*\surl=["']([^"']+)["'][^>]*>/i);
      if (enclosureUrlMatch) {
        const url = enclosureUrlMatch[1];
        const enclosureTag = itemContent.match(/<enclosure[^>]*>/i)?.[0] || '';
        // Check if type is image, or if URL looks like an image
        const isImageType = /type=["']image\//i.test(enclosureTag);
        const isImageUrl = /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i.test(url);
        if (isImageType || isImageUrl) {
          imageUrl = url;
        }
      }
    }
    
    // Try image tag within item
    if (!imageUrl) {
      const imageMatch = itemContent.match(/<image[^>]*>(?:[\s\S]*?<url>([^<]+)<\/url>)?[\s\S]*?<\/image>/i);
      if (imageMatch && imageMatch[1]) {
        imageUrl = imageMatch[1].trim();
      }
    }
    
    // Try to extract image from description HTML (img tag)
    if (!imageUrl) {
      const descImgMatch = itemContent.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
      if (descImgMatch) {
        imageUrl = descImgMatch[1];
      }
    }
    
    // Validate the image URL
    if (!isValidImageUrl(imageUrl)) {
      imageUrl = null;
    }
    
    const title = titleMatch?.[1]?.trim().replace(/<[^>]*>/g, '') || '';
    const description = descMatch?.[1]?.trim().replace(/<[^>]*>/g, '') || '';
    
    if (title) {
      items.push({
        title,
        description: description.substring(0, 500), // Limit description length
        link: linkMatch?.[1]?.trim() || '',
        pubDate: pubDateMatch?.[1]?.trim() || new Date().toISOString(),
        source: sourceName,
        imageUrl,
      });
    }
  }
  
  return items;
}

// Fetch and parse RSS feeds
async function fetchRSSFeeds(): Promise<RSSItem[]> {
  const allItems: RSSItem[] = [];
  
  for (const feed of RSS_FEEDS) {
    try {
      console.log(`Fetching RSS from: ${feed.name}`);
      const response = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FantasyNewsBot/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
      });
      
      if (response.ok) {
        const xml = await response.text();
        const items = parseRSSXML(xml, feed.name);
        console.log(`  Found ${items.length} items from ${feed.name}`);
        allItems.push(...items);
      } else {
        console.warn(`  Failed to fetch ${feed.name}: ${response.status}`);
      }
    } catch (error) {
      console.warn(`  Error fetching ${feed.name}:`, error);
    }
    
    // Small delay between feeds
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return allItems;
}

// Filter and select relevant fantasy football stories
function selectRelevantStories(items: RSSItem[], count: number): NewsStory[] {
  // Keywords that indicate fantasy-relevant content
  const fantasyKeywords = [
    'fantasy', 'waiver', 'start', 'sit', 'pickup', 'trade',
    'injury', 'injured', 'out', 'questionable', 'doubtful',
    'breakout', 'sleeper', 'boom', 'bust', 'target',
    'touchdown', 'yards', 'rushing', 'receiving', 'passing',
    'rb', 'wr', 'qb', 'te', 'running back', 'wide receiver', 'quarterback', 'tight end',
    'roster', 'depth chart', 'snap', 'workload', 'volume',
    'dynasty', 'redraft', 'keeper', 'rankings'
  ];
  
  // Score and filter items
  const scoredItems = items.map(item => {
    const text = `${item.title} ${item.description}`.toLowerCase();
    let score = 0;
    
    for (const keyword of fantasyKeywords) {
      if (text.includes(keyword)) {
        score += 1;
      }
    }
    
    // Boost recent items
    const pubDate = new Date(item.pubDate);
    const hoursSincePublished = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60);
    if (hoursSincePublished < 24) score += 2;
    if (hoursSincePublished < 6) score += 2;
    
    // Boost items with valid images (important for UI)
    if (isValidImageUrl(item.imageUrl)) {
      score += 3;
    }
    
    return { item, score };
  });
  
  // Sort by score and take top items
  const topItems = scoredItems
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count * 2); // Get more than needed for variety
  
  // Convert to NewsStory format
  const stories: NewsStory[] = topItems.map(({ item }) => {
    // Determine category based on content
    const text = `${item.title} ${item.description}`.toLowerCase();
    let category = 'general';
    
    if (text.includes('waiver') || text.includes('pickup')) category = 'waiver_wire';
    else if (text.includes('injury') || text.includes('injured') || text.includes('out')) category = 'injury';
    else if (text.includes('trade')) category = 'trade_value';
    else if (text.includes('breakout') || text.includes('sleeper')) category = 'breakout';
    else if (text.includes('start') || text.includes('sit') || text.includes('ranking')) category = 'start_sit';
    else if (text.includes('touchdown') || text.includes('yards')) category = 'performance';
    
    return {
      title: item.title,
      summary: item.description,
      source: item.source,
      category,
      imageUrl: item.imageUrl,
    };
  });
  
  // Filter to only include stories with valid images
  const storiesWithImages = stories.filter(story => isValidImageUrl(story.imageUrl));
  
  // Deduplicate by title similarity
  const uniqueStories: NewsStory[] = [];
  for (const story of storiesWithImages) {
    const isDupe = uniqueStories.some(s => 
      s.title.toLowerCase().includes(story.title.toLowerCase().split(' ').slice(0, 3).join(' ')) ||
      story.title.toLowerCase().includes(s.title.toLowerCase().split(' ').slice(0, 3).join(' '))
    );
    if (!isDupe) {
      uniqueStories.push(story);
    }
    if (uniqueStories.length >= count) break;
  }
  
  return uniqueStories;
}

// Generate fallback stories if RSS fails
function getFallbackStories(count: number): NewsStory[] {
  return FALLBACK_TOPICS.slice(0, count).map(topic => ({
    title: topic.title,
    summary: `Analysis and insights for fantasy football managers on ${topic.title.toLowerCase()}.`,
    source: "Fantasy Football Insights",
    category: topic.category,
    imageUrl: null,
  }));
}

// Generate an NFL news article using OpenAI
async function generateNFLArticle(
  story: NewsStory,
  articleIndex: number,
  openaiKey: string
): Promise<{ title: string; subtitle: string; content: string; articleType: string } | null> {
  
  const systemPrompt = `You are an NFL fantasy football analyst writing engaging news articles.

Your style:
- Engaging and informative, like top fantasy analysts at ESPN or The Ringer
- Focus on fantasy football implications
- Actionable insights for fantasy managers
- Short, punchy paragraphs
- Use **bold** for emphasis on key points
- 200-350 words per article
- Include specific player names and their fantasy implications when relevant
- Consider both redraft and dynasty fantasy formats when applicable

Write articles that help fantasy football managers make informed decisions about their rosters.`;

  const userPrompt = `Write an engaging fantasy football news article based on this story:

Original Headline: ${story.title}
Summary: ${story.summary}
Source: ${story.source}
Category: ${story.category}

Create a fresh, engaging article that:
1. Has a catchy headline (different from the original)
2. Explains the fantasy football implications
3. Gives actionable advice to fantasy managers
4. Mentions relevant players and their value impact

Return valid JSON:
{
  "title": "Your catchy headline here",
  "subtitle": "Brief tagline summarizing the key takeaway",
  "content": "Full article content with **bold** for emphasis. Include fantasy analysis and recommendations."
}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error(`OpenAI error for article ${articleIndex + 1}:`, await response.text());
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return {
      title: parsed.title,
      subtitle: parsed.subtitle,
      content: parsed.content,
      articleType: "nfl_news",
    };
  } catch (error) {
    console.error(`Error generating NFL article ${articleIndex + 1}:`, error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Fetch RSS feeds
    console.log("Fetching NFL news from RSS feeds...");
    const rssItems = await fetchRSSFeeds();
    console.log(`Total RSS items fetched: ${rssItems.length}`);

    // Select relevant stories
    let stories: NewsStory[];
    if (rssItems.length > 0) {
      stories = selectRelevantStories(rssItems, NFL_NEWS_TO_GENERATE);
      console.log(`Selected ${stories.length} relevant stories`);
    } else {
      console.log("No RSS items found, using fallback topics");
      stories = getFallbackStories(NFL_NEWS_TO_GENERATE);
    }

    // If still no stories, return early
    if (stories.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No stories available to generate",
          count: 0,
          articles: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete previous NFL news articles (keep league news separate)
    console.log("Deleting previous NFL news articles...");
    await supabase
      .from("articles")
      .delete()
      .eq("article_type", "nfl_news");

    // Generate articles
    console.log(`Generating ${stories.length} NFL news articles...`);
    const generatedArticles = [];

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];
      console.log(`Generating article ${i + 1}/${stories.length}: ${story.title.substring(0, 50)}...`);
      
      const article = await generateNFLArticle(story, i, openaiKey);
      
      if (article) {
        // Save to database
        const { data: saved, error } = await supabase
          .from("articles")
          .insert({
            league_id: null, // NFL news is not league-specific
            title: article.title,
            subtitle: article.subtitle,
            content: article.content,
            article_type: article.articleType,
            embedded_data: {
              source: story.source,
              category: story.category,
              original_title: story.title,
              image_url: story.imageUrl,
            },
            published: true,
          })
          .select()
          .single();

        if (saved) {
          generatedArticles.push(saved);
          console.log(`Article ${i + 1} saved: "${article.title}"`);
        } else {
          console.error(`Failed to save article ${i + 1}:`, error);
        }
      }

      // Small delay between articles to avoid rate limits
      if (i < stories.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`Generation complete: ${generatedArticles.length}/${stories.length} articles`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${generatedArticles.length} NFL news articles`,
        count: generatedArticles.length,
        articles: generatedArticles,
        rssItemsFound: rssItems.length,
        storiesSelected: stories.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
