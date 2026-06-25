# Airtable Setup

Use Airtable as the CMS and GitHub Pages as the static host.

## Required Table

Create a table called `Startups`.

Recommended fields:

- `Status` - single select: `Draft`, `Ready`, `Published`
- `Slug` - single line text, e.g. `autocast`
- `Startup Name`
- `Tagline`
- `Founding Date`
- `Stage of Company / Product Stage`
- `Team Size`
- `Contact person`
- `Email`
- `Website`
- `Problem` - long text
- `Solution Intro` - long text
- `Solution Bullets` - long text, one bullet per line
- `Solution After` - long text
- `Core Team` - long text, one person per line using `Name | Role | bullet 1; bullet 2`
- `Market Opportunity` - long text, one bullet per line
- `Competitors` - long text, one bullet per line
- `Business Model Intro` - optional long text
- `Target Customers` - long text, one bullet per line
- `Business Model` - long text
- `Milestones Reached` - long text, one bullet per line
- `Milestones Planned` - long text, one bullet per line
- `Competitive Advantage Intro` - optional long text
- `Competitive Advantage` - long text, one bullet per line
- `Support Need`
- `Support Need Label` - optional
- `Logo Text` - optional, e.g. `AC`
- `Incubator Logo` - optional attachment or public URL

Only records with empty `Status`, `Ready`, `Published`, or `Live` are included in the build.

## Local Build

Copy `.env.example` to `.env.local` and fill in the Airtable values.

```sh
npm run build
```

If Airtable credentials are missing, the build uses the current local sample data.

## GitHub Pages Build

Add these repository secrets in GitHub:

- `AIRTABLE_TOKEN`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_STARTUPS_TABLE`
- `AIRTABLE_VIEW`

Then every push to `main` rebuilds the static pages from Airtable.
