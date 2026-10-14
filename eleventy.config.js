// ---- Merge _data/existingPosts.json (the 61 hand-authored legacy posts)
// with the live content/blog/*.md collection (new CMS posts) into one
// normalized, newest-first list. Shared by the blog index, the 6 category
// pages, sitemap.xml and llms.txt so a new CMS post appears everywhere
// automatically, with no hand-editing of any of those four files.
function buildBlogPosts(collectionApi) {
  const existingPosts = require("./_data/existingPosts.json");
  const newPostItems = collectionApi.getFilteredByGlob("content/blog/*.md");

  const existingNormalized = existingPosts.map(function (p) {
    return {
      slug: p.slug,
      url: "/blog/" + p.slug,
      category: p.category,
      image: p.image,
      cardTitle: p.cardTitle,
      cardExcerpt: p.cardExcerpt,
      cardYearLabel: p.cardYearLabel,
      cardCategoryLabel: p.cardCategoryLabel || null,
      readTime: p.readTime,
      datePublished: p.datePublished,
      dateModified: p.dateModified,
      sitemapChangefreq: p.sitemapChangefreq || "monthly",
      sitemapPriority: p.sitemapPriority || "0.8",
      llmsTitle: p.llmsTitle || p.cardTitle,
      llmsDescription: p.llmsDescription || p.cardExcerpt,
    };
  });

  const newNormalized = newPostItems.map(function (item) {
    const d = item.data;
    const slug = d.canonicalSlug;
    return {
      slug: slug,
      url: "/blog/" + slug,
      category: d.category,
      image: d.ogImage,
      cardTitle: d.cardTitle || d.h1,
      cardExcerpt: d.cardExcerpt || d.metaDescription,
      cardYearLabel: d.cardYearLabel || String(d.datePublished).slice(0, 4),
      cardCategoryLabel: d.cardCategoryLabel || null,
      readTime: d.readTime,
      datePublished: d.datePublished,
      dateModified: d.dateModified,
      sitemapChangefreq: d.sitemapChangefreq || "monthly",
      sitemapPriority: d.sitemapPriority || "0.8",
      llmsTitle: d.llmsTitle || d.cardTitle || d.h1,
      llmsDescription: d.llmsDescription || d.cardExcerpt || d.metaDescription,
    };
  });

  const all = existingNormalized.concat(newNormalized);

  // Newest first by datePublished; tie-break alphabetically by cardTitle so
  // the order is fully deterministic when two posts share a publish date.
  all.sort(function (a, b) {
    if (a.datePublished !== b.datePublished) {
      return a.datePublished < b.datePublished ? 1 : -1;
    }
    if (a.cardTitle !== b.cardTitle) {
      return a.cardTitle < b.cardTitle ? -1 : 1;
    }
    return 0;
  });

  return all;
}

module.exports = function (eleventyConfig) {
  // ---- Blog Studio (admin/): js-yaml and marked are copied from node_modules
  // at build time so the admin page loads them from its own origin and runs
  // under the strict /admin/ Content-Security-Policy. Requires `npm ci` first
  // (true for both local builds and the deploy workflow).
  eleventyConfig.on("eleventy.before", () => {
    const fs = require("fs");
    fs.mkdirSync("admin/vendor", { recursive: true });
    fs.copyFileSync("node_modules/js-yaml/dist/js-yaml.min.js", "admin/vendor/js-yaml.min.js");
    fs.copyFileSync("node_modules/marked/lib/marked.umd.js", "admin/vendor/marked.umd.js");
    fs.copyFileSync("node_modules/qrcode-generator/qrcode.js", "admin/vendor/qrcode.js");
    // Poppins (the site's font), self-hosted so the strict admin CSP needs no CDN.
    fs.mkdirSync("admin/vendor/fonts", { recursive: true });
    [400, 500, 600, 700, 800].forEach((w) => {
      fs.copyFileSync(
        "node_modules/@fontsource/poppins/files/poppins-latin-" + w + "-normal.woff2",
        "admin/vendor/fonts/poppins-" + w + ".woff2"
      );
    });
  });

  // ---- Existing static content: copied through untouched, byte-identical ----
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("degrees");
  eleventyConfig.addPassthroughCopy("finals-img");
  eleventyConfig.addPassthroughCopy("results-img");
  eleventyConfig.addPassthroughCopy("reviews-img");
  eleventyConfig.addPassthroughCopy("services");
  // blog/*.html: every individual post page (e.g. blog/vu-pros-and-cons.html)
  // stays a hand-maintained flat file passed through untouched. blog/index.html
  // no longer exists as a static file (it's Eleventy-generated from
  // blog/index.njk), so this glob no longer matches it. blog/category/*.html
  // no longer exists either (not passed through at all): all 6 category
  // pages are now Eleventy-generated from blog/category/*.njk.
  eleventyConfig.addPassthroughCopy({ "blog/*.html": "blog" });
  eleventyConfig.addPassthroughCopy("index.html");
  eleventyConfig.addPassthroughCopy("about.html");
  eleventyConfig.addPassthroughCopy("contact.html");
  eleventyConfig.addPassthroughCopy("results.html");
  eleventyConfig.addPassthroughCopy("reviews.html");
  eleventyConfig.addPassthroughCopy("vu-notes.html");
  eleventyConfig.addPassthroughCopy("scheme.html");
  eleventyConfig.addPassthroughCopy("cgpa-calculator.html");
  eleventyConfig.addPassthroughCopy("vu-admission-portal.html");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy(".htaccess");

  // ---- Blog Studio admin panel (self-hosted, no CDN dependency) ----
  eleventyConfig.addPassthroughCopy("admin");

  // sitemap.xml and llms.txt are intentionally NOT passed through here —
  // they are Eleventy-generated (see sitemap.njk / llms.njk at the repo
  // root) so new CMS posts appear in them automatically.

  // ---- Blog post data: merges _data/existingPosts.json with the live
  // content/blog/*.md collection. Used by blog/index.njk, the 6
  // blog/category/*.njk pages, sitemap.njk and llms.njk.
  eleventyConfig.addCollection("blogPosts", function (collectionApi) {
    return buildBlogPosts(collectionApi);
  });
  eleventyConfig.addCollection("blogPostsByCategory", function (collectionApi) {
    const byCategory = {};
    buildBlogPosts(collectionApi).forEach(function (post) {
      if (!byCategory[post.category]) byCategory[post.category] = [];
      byCategory[post.category].push(post);
    });
    return byCategory;
  });
  // Aggregates used by sitemap.njk: the freshest dateModified overall (for
  // /blog/'s own <lastmod>) and per category (for each category page's).
  eleventyConfig.addCollection("blogMeta", function (collectionApi) {
    const all = buildBlogPosts(collectionApi);
    let maxDateModified = null;
    const maxDateModifiedByCategory = {};
    all.forEach(function (post) {
      if (!maxDateModified || post.dateModified > maxDateModified) {
        maxDateModified = post.dateModified;
      }
      if (!maxDateModifiedByCategory[post.category] || post.dateModified > maxDateModifiedByCategory[post.category]) {
        maxDateModifiedByCategory[post.category] = post.dateModified;
      }
    });
    return { maxDateModified: maxDateModified, maxDateModifiedByCategory: maxDateModifiedByCategory };
  });

  return {
    dir: {
      input: ".",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
