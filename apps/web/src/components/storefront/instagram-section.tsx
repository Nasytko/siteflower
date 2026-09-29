import Image from 'next/image';
import Link from 'next/link';
import type { InstagramFeedPublicDto } from '@bouquet-one/contracts';

type Props = {
  feed: InstagramFeedPublicDto;
  heading?: string;
};

function isLocalMedia(url: string): boolean {
  return (
    url.startsWith('/') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('/api/v1/media/')
  );
}

/**
 * Dicentra-style Instagram strip: brand + @handle on the left,
 * curated horizontal post previews on the right.
 */
export function InstagramSection({ feed, heading }: Props) {
  if (feed.posts.length === 0) return null;

  const title = heading?.trim() || `${feed.brandName} в Instagram`;
  const profileHref = feed.profileUrl ?? feed.posts[0]?.postUrl ?? null;

  return (
    <section className="sf-instagram py-12 md:py-16">
      <div className="sf-container-wide">
        <div className="sf-instagram__layout">
          <div className="sf-instagram__intro">
            <h2 className="sf-instagram__title">{title}</h2>
            {feed.handle ? (
              profileHref ? (
                <Link
                  href={profileHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sf-instagram__handle"
                >
                  {feed.handle}
                </Link>
              ) : (
                <p className="sf-instagram__handle">{feed.handle}</p>
              )
            ) : null}
          </div>

          <ul className="sf-instagram__scroller">
            {feed.posts.map((post) => {
              const href = post.postUrl || profileHref;
              const media = isLocalMedia(post.imageUrl) ? (
                <Image
                  src={post.imageUrl}
                  alt={post.caption || feed.brandName}
                  fill
                  sizes="(max-width: 768px) 55vw, 22vw"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
              ) : (
                // External curated URLs — avoid next/image host allowlist friction.
                // External Instagram CDN — plain img is intentional
                <img
                  src={post.imageUrl}
                  alt={post.caption || feed.brandName}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
              );
              const inner = (
                <>
                  {media}
                  {post.caption ? (
                    <span className="sf-instagram__caption">{post.caption}</span>
                  ) : null}
                </>
              );
              return (
                <li key={post.id}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sf-instagram__card group"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className="sf-instagram__card group">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
