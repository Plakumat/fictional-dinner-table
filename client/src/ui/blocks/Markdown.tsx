import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { safeLink } from '../../core/markdown/safeLink';
import { stableMarkdown } from '../../core/markdown/stableMarkdown';
import { Icon } from '../Icon';
import styles from './blocks.module.css';

// text.markdown is written by a model that quotes untrusted data verbatim, so
// it is rendered under three rules:
//
// 1. Raw HTML is never HTML. react-markdown builds React elements from the
//    markdown syntax tree and never sets innerHTML; without the rehype-raw
//    plugin (which we do not use) an HTML node becomes a text node. An
//    <img onerror=…> in an order note is shown as those characters.
// 2. A link is clickable only if core/markdown/safeLink allows it (http, https,
//    mailto). Anything else, javascript: included, keeps its label and loses
//    its href.
// 3. Images are never loaded. A remote image is a request the user did not
//    make; the alt text is shown instead.
//
// Rules 2 and 3 are applied twice on purpose: in `urlTransform`, which runs on
// every URL in the tree, and again in the components that draw them.

const pageOrigin = () => window.location.origin;

const components: Components = {
  a({ href, children }) {
    const link = safeLink(href, pageOrigin());
    if (!link) {
      return (
        <span className={styles.inert} title="This link was not made clickable because its address is not a web or mail address.">
          {children}
        </span>
      );
    }
    if (!link.external) return <a href={link.href}>{children}</a>;
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
        <span className={styles.externalMark}>
          <Icon name="external" size={13} />
        </span>
        <span className="visually-hidden"> (external link, opens in a new tab)</span>
      </a>
    );
  },
  img({ alt }) {
    return <span className={styles.inert}>{alt ? `[image: ${alt}]` : '[image not loaded]'}</span>;
  },
};

const urlTransform = (url: string): string => safeLink(url, pageOrigin())?.href ?? '';

interface Props {
  markdown: string;
  /** Still receiving deltas: unfinished syntax on the last line is steadied so the text does not flicker. */
  streaming?: boolean;
}

export const Markdown = memo(function Markdown({ markdown, streaming = false }: Props) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown components={components} urlTransform={urlTransform}>
        {streaming ? stableMarkdown(markdown) : markdown}
      </ReactMarkdown>
    </div>
  );
});
