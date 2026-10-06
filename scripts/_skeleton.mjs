// The starting shape of the PRIVATE vault: the same folder structure the demo
// vault uses, with an empty _index.md per folder and the seven domain notes the
// ingestion agent's Pass B routes to by name. No content — just the bones.
//
// Shared by `scripts/spaces.mjs seed-private` (API path) and
// `scripts/build-seed-sql.mjs` (generates supabase/03_seed_private.sql), so the
// two setup routes always produce the identical vault.

export const SKELETON = [
  ["", "LifeOS", "Root index — the map of this vault."],
  ["journal", "Journal", "Daily logs, one note per day (journal/YYYY/YYYY-MM-DD.md)."],
  ["people", "People", "One note per person, grouped by how I know them."],
  ["people/family", "Family", "Family notes."],
  ["people/friends", "Friends", "Friend notes."],
  ["people/mentors", "Mentors", "Professors, supervisors, advisors, coaches."],
  ["health", "Health", "Fitness, sleep, food and headspace."],
  ["finances", "Finances", "Spending, income, goals."],
  ["education", "Education", "School, courses, research."],
  ["education/courses", "Courses", "One note per course."],
  ["education/research", "Research", "Research work and lab notes."],
  ["career", "Career", "Work, applications, goals."],
  ["projects", "Projects", "Things I'm building."],
  ["events", "Events", "Trips, festivals, milestones — one note each."],
  ["reflections", "Reflections", "Longer-form thinking."],
  ["inbox", "Inbox", "Unsorted — anything that doesn't have a home yet."],
];

// Without these, the first capture spends agent turns creating them.
export const DOMAIN_NOTES = [
  ["health/fitness.md", "Fitness", "Workouts, runs, lifts, sport.", ["health/workout"]],
  ["health/sleep.md", "Sleep", "Sleep quality and schedule.", ["health/sleep"]],
  ["health/food.md", "Food", "Meals, cooking, groceries.", ["health/food"]],
  ["health/mental.md", "Headspace", "Mood, stress, gratitude, homesickness.", ["health/mood"]],
  ["finances/expenses.md", "Expenses", "What I spent and on what.", ["finance/expense"]],
  ["finances/income.md", "Income", "Pay, side income, transfers in.", ["finance/income"]],
  ["finances/goals.md", "Money Goals", "Savings targets and money plans.", ["finance/goal"]],
];

function frontmatter({ title, summary, tags = [] }, day) {
  return ["---", `title: ${title}`, `summary: ${summary}`, `tags: [${tags.join(", ")}]`, `created: ${day}`, `updated: ${day}`, "---", ""].join("\n");
}

/** Every skeleton file as a plain row: { path, folder, title, summary, tags, content, word_count }. */
export function skeletonRows(day = new Date().toISOString().slice(0, 10)) {
  const rows = [];
  for (const [folder, title, summary] of SKELETON) {
    const path = folder ? `${folder}/_index.md` : "_index.md";
    const tags = ["index"];
    const content =
      folder === ""
        ? `${frontmatter({ title, summary, tags }, day)}# ${title}\n\nA living journal and knowledge base.\n\n## Map\n\n${SKELETON.filter(([f]) => f && !f.includes("/"))
            .map(([f, , s]) => `- [[${f}]] — ${s}`)
            .join("\n")}\n\n## Recent\n\n_(nothing yet)_\n`
        : `${frontmatter({ title, summary, tags }, day)}# ${title}\n\n${summary}\n\n## Notes\n\n_(nothing yet)_\n`;
    rows.push({ path, folder, title, summary, tags, content });
  }
  for (const [path, title, summary, tags] of DOMAIN_NOTES) {
    rows.push({
      path,
      folder: path.split("/").slice(0, -1).join("/"),
      title,
      summary,
      tags,
      content: `${frontmatter({ title, summary, tags }, day)}# ${title}\n\n${summary}\n`,
    });
  }
  for (const r of rows) {
    r.word_count = r.content.split(/\s+/).filter(Boolean).length;
    r.frontmatter = { title: r.title, summary: r.summary, tags: r.tags, created: day, updated: day };
  }
  return rows;
}
