const ALLOWED = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li"]);

const sanitizeRichText = (input) => String(input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-z0-9]+)(\s[^>]*)?\/?>/gi, (full, tag) => {
        const name = tag.toLowerCase();
        if (!ALLOWED.has(name)) return "";
        if (name === "br") return "<br>";
        return full.startsWith("</") ? `</${name}>` : `<${name}>`;
    })
    .trim();

const plainRichText = (input) => sanitizeRichText(input)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

module.exports = { sanitizeRichText, plainRichText };
