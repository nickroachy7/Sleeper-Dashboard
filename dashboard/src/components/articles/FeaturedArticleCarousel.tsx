import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';

interface Article {
  id: string;
  title: string;
  subtitle: string | null;
  content: string;
  article_type: string;
  embedded_data: {
    trades?: string[];
    image_url?: string | null;
    source?: string;
  };
  generated_at: string;
}

interface FeaturedArticleCarouselProps {
  articles: Article[];
  maxArticles?: number;
}

export function FeaturedArticleCarousel({ articles, maxArticles = 5 }: FeaturedArticleCarouselProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const featuredArticles = articles.slice(0, maxArticles);

  const scrollToIndex = (index: number) => {
    if (carouselRef.current) {
      const cardWidth = carouselRef.current.offsetWidth;
      carouselRef.current.scrollTo({
        left: index * cardWidth,
        behavior: 'smooth'
      });
      setCurrentIndex(index);
    }
  };

  const handlePrevious = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : featuredArticles.length - 1;
    scrollToIndex(newIndex);
  };

  const handleNext = () => {
    const newIndex = currentIndex < featuredArticles.length - 1 ? currentIndex + 1 : 0;
    scrollToIndex(newIndex);
  };

  // Handle scroll events to update current index
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const handleScroll = () => {
      const cardWidth = carousel.offsetWidth;
      const newIndex = Math.round(carousel.scrollLeft / cardWidth);
      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < featuredArticles.length) {
        setCurrentIndex(newIndex);
      }
    };

    carousel.addEventListener('scroll', handleScroll);
    return () => carousel.removeEventListener('scroll', handleScroll);
  }, [currentIndex, featuredArticles.length]);

  // Mouse drag handlers for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!carouselRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - carouselRef.current.offsetLeft);
    setScrollLeft(carouselRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !carouselRef.current) return;
    e.preventDefault();
    const x = e.pageX - carouselRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    carouselRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    // Snap to nearest card
    if (carouselRef.current) {
      const cardWidth = carouselRef.current.offsetWidth;
      const newIndex = Math.round(carouselRef.current.scrollLeft / cardWidth);
      scrollToIndex(Math.max(0, Math.min(newIndex, featuredArticles.length - 1)));
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (featuredArticles.length === 0) return null;

  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-sm sm:text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
          Featured Stories
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevious}
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
            aria-label="Previous article"
          >
            <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          </button>
          <button
            onClick={handleNext}
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
            aria-label="Next article"
          >
            <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
      </div>

      <div className="relative">
        {/* Carousel Container */}
        <div
          ref={carouselRef}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide cursor-grab active:cursor-grabbing"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {featuredArticles.map((article, index) => {
            const hasImage = article.embedded_data?.image_url;

            return (
              <div
                key={article.id}
                className="flex-none w-full snap-center px-1"
              >
                <div
                  onClick={() => !isDragging && navigate(`/article/${article.id}`)}
                  className="relative bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden cursor-pointer hover:border-accent-300 dark:hover:border-accent-600 transition-all group h-[200px] sm:h-[240px]"
                >
                  {/* Background Image or Gradient */}
                  {hasImage ? (
                    <div className="absolute inset-0">
                      <img
                        src={article.embedded_data.image_url!}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      {/* Stronger gradient overlay for better text readability */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/30" />
                    </div>
                  ) : (
                    <div className={`absolute inset-0 bg-gradient-to-br ${
                      article.article_type === 'trade' || article.article_type === 'trade_analysis' || article.article_type === 'trade_recap'
                        ? 'from-purple-500/20 via-purple-500/10 to-transparent'
                        : article.article_type === 'standings' || article.article_type === 'contender'
                        ? 'from-amber-500/20 via-amber-500/10 to-transparent'
                        : article.article_type === 'power_rankings'
                        ? 'from-blue-500/20 via-blue-500/10 to-transparent'
                        : article.article_type === 'nfl_news'
                        ? 'from-sky-500/20 via-sky-500/10 to-transparent'
                        : 'from-accent-500/20 via-accent-500/10 to-transparent'
                    }`} />
                  )}

                  {/* Content */}
                  <div className="relative h-full flex flex-col justify-end p-4 sm:p-5">
                    {/* Carousel indicator on top right */}
                    <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        hasImage 
                          ? 'bg-black/50 text-white backdrop-blur-sm' 
                          : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        {index + 1}/{featuredArticles.length}
                      </span>
                    </div>

                    {/* Text Content - Simplified */}
                    <div className={hasImage ? '[text-shadow:_0_2px_12px_rgb(0_0_0_/_90%)]' : ''}>
                      <h3 className={`text-xl sm:text-2xl font-bold line-clamp-2 group-hover:underline decoration-2 underline-offset-2 mb-2 ${
                        hasImage ? 'text-white' : 'text-slate-900 dark:text-white'
                      }`}>
                        {article.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${
                          hasImage ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {formatDate(article.generated_at)}
                        </span>
                        {article.embedded_data?.source && (
                          <>
                            <span className={`${hasImage ? 'text-white/50' : 'text-slate-300 dark:text-slate-600'}`}>•</span>
                            <span className={`text-sm font-medium ${
                              hasImage ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'
                            }`}>
                              {article.embedded_data.source}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dots Indicator */}
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {featuredArticles.map((_, index) => (
            <button
              key={index}
              onClick={() => scrollToIndex(index)}
              className={`h-1.5 rounded-full transition-all ${
                index === currentIndex
                  ? 'w-6 bg-accent-500'
                  : 'w-1.5 bg-slate-300 dark:bg-zinc-600 hover:bg-slate-400 dark:hover:bg-zinc-500'
              }`}
              aria-label={`Go to article ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
