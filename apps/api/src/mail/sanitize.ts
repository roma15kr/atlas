import sanitizeHtml from "sanitize-html";

const allowedTags = [
  "a", "b", "strong", "i", "em", "u", "s", "strike", "p", "br", "div", "span", "blockquote", "pre", "code", "hr",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tfoot", "tr", "td", "th",
  "img", "font", "center", "small", "big", "sub", "sup"
];

/**
 * Sanitizes untrusted mail HTML once, on ingest: formatting only, no scripts, forms, frames, event
 * handlers or script URLs. Remote images move to `data-remote-src` so opening mail never contacts
 * the sender; `cid:` and `data:` images stay.
 */
export function sanitizeMailHtml(html: string): { html: string; hasRemoteImages: boolean } {
  let hasRemoteImages = false;
  const clean = sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      a: ["href", "title", "target", "rel"], img: ["src", "alt", "width", "height", "data-remote-src"], td: ["colspan", "rowspan", "align", "valign", "width"],
      th: ["colspan", "rowspan", "align", "valign", "width"], table: ["width", "cellpadding", "cellspacing", "border", "align"],
      font: ["color", "size"], "*": ["style", "dir"]
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["cid", "data"] },
    allowedStyles: {
      "*": {
        color: [/^[#a-z0-9(),.\s%]+$/i], "background-color": [/^[#a-z0-9(),.\s%]+$/i], "text-align": [/^(left|right|center|justify)$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/], "font-style": [/^(normal|italic)$/], "text-decoration": [/^[a-z\s-]+$/],
        "font-size": [/^\d+(\.\d+)?(px|pt|em|rem|%)$/], margin: [/^[\d.\s(px|em|%)-]+$/], padding: [/^[\d.\s(px|em|%)-]+$/],
        width: [/^\d+(\.\d+)?(px|%)$/], border: [/^[#a-z0-9.\s-]+$/i]
      }
    },
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" } }),
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";
        if (/^https?:/i.test(src)) {
          hasRemoteImages = true;
          const { src: _remote, ...rest } = attribs;
          return { tagName, attribs: { ...rest, "data-remote-src": src } };
        }
        return { tagName, attribs };
      }
    },
    allowProtocolRelative: false
  });
  return { html: clean, hasRemoteImages };
}

/** Restores deferred remote images for one message, after the owner chose to show them. */
export function withRemoteImages(html: string): string {
  return html.replace(/data-remote-src="(https?:[^"]*)"/g, 'src="$1"');
}

export function snippetOf(text: string | null | undefined, html: string | null | undefined): string {
  const source = text?.trim() ? text : sanitizeHtml(html ?? "", { allowedTags: [], allowedAttributes: {} });
  return source.replace(/\s+/g, " ").trim().slice(0, 200);
}
