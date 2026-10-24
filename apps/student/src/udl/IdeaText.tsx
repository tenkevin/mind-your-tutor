import { ReadAloud } from './ReadAloud';

export interface Media {
  src: string;
  /** What the picture shows, for students who can't see it. Required. */
  alt: string;
  caption?: string;
}

/**
 * An idea's explanation in more than one form (D17 representation): the text is
 * always there and can be read aloud; a picture, when there is one, adds to it
 * and never replaces it.
 */
export function IdeaText({
  title,
  text,
  media,
}: {
  title: string;
  text: string;
  media?: Media | null;
}) {
  return (
    <article className="udl-card">
      <h2 className="udl-title">{title}</h2>
      {media && (
        <figure className="udl-figure">
          <img className="lighten" src={media.src} alt={media.alt} />
          {media.caption && <figcaption>{media.caption}</figcaption>}
        </figure>
      )}
      <ReadAloud text={text} />
    </article>
  );
}
