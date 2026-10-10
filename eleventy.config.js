module.exports = function (eleventyConfig) {
  // ---- Existing static content: copied through untouched, byte-identical ----
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("degrees");
  eleventyConfig.addPassthroughCopy("finals-img");
  eleventyConfig.addPassthroughCopy("results-img");
  eleventyConfig.addPassthroughCopy("reviews-img");
  eleventyConfig.addPassthroughCopy("services");
  eleventyConfig.addPassthroughCopy({ "blog/*.html": "blog" });
  eleventyConfig.addPassthroughCopy("blog/category");
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

  // ---- CMS admin panel (self-hosted, no CDN dependency) ----
  eleventyConfig.addPassthroughCopy("admin");

  // sitemap.xml and llms.txt are intentionally NOT passed through here —
  // they are Eleventy-generated (see content/sitemap.njk / content/llms.njk)
  // so new CMS posts appear in them automatically.

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
