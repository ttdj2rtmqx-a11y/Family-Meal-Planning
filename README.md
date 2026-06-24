# Family Shopping Optimizer

A dashboard for planning lower-cost family shopping runs. It starts with sample household data and is structured so real spending patterns can be uploaded later without committing private exports to GitHub.

The starter vendor set is constrained to West Kelowna grocery options plus Costco Kelowna for bulk shopping.

## What it shows

- Weekly cost baseline versus optimized plan
- Household staples that can be added or marked low
- Read-only market deal signals maintained by the daily refresh
- Editable servings, budget, goals, cravings, and avoid list
- Optimization modes for lowest cost, balanced variety, and fastest prep
- Seven-day meal-plan cards with swap and change controls
- Recipe details for suggested meals
- External recipe ideas from TheMealDB with photos and source links
- Manual recipe input for family recipes
- Shopping needs that update from the selected meals, pantry, active deals, servings, and budget
- Online cart builder with vendor-specific carts and checkout handoff links
- Category savings opportunities
- Best stores by basket savings and distance
- Visual route map for the weekly shopping run
- Upload-ready spending data panel

## Local setup

```bash
npm install
npm run start
```

## Public dashboard link

When GitHub Pages is enabled for this repository, the live dashboard will be available at:

https://ttdj2rtmqx-a11y.github.io/Family-Meal-Planning/

## Data shape

The starter plan lives in `data/sample-shopping-plan.json`. Later imports should map transactions or receipts into:

- `date`
- `merchant`
- `item`
- `category`
- `amount`
- `household need`

The two-way planner also expects optional pantry and market inputs:

- household staple name, quantity, category, and status
- market deal item, store, sale price, normal price, unit, and expiration
- meal ingredient item, quantity, store, price, and whether it is already covered at home
- external recipe suggestion title, source URL, image URL, match tags, and deal/pantry rationale

## External recipe source

The dashboard uses curated links from TheMealDB for external recipe suggestions. The app links out to the original recipe and uses available meal thumbnail photos rather than copying full external recipe content into the dashboard.

## Privacy note

Do not commit real bank exports, receipt data, or family spending history. Upload those files only through a private import flow when the dashboard is expanded to support personal spending data.
