# SmartyD Core Parity Plan

**Goal:** Build the first release around the ten core modules in the same order and business workflow style as SmartyD. Keep MD Hygiene branding, workspace data and permissions. This is an implementation roadmap, not a claim that every module is complete.

## Main application navigation

1. Home — workspace overview and business metrics
2. Google Business — business profile, insights, posts and profile tools
3. Reviews — customer reviews, replies, feedback requests and forms
4. Website — public business website / digital business profile
5. Catalogue — product categories, products, prices, stock and public catalogue
6. WhatsApp CRM — customer conversations, contacts and business messaging
7. Orders & POS — online orders, counter billing, dine-in/takeaway and kitchen workflow
8. Loyalty — loyalty programmes, customers, stamps and reward redemption
9. Smart QR — review, website and table/menu QR entry points
10. Analytics — business performance and activity

Settings and external provider connections remain accessible from the account menu / Settings. Facebook, Instagram and Google OAuth setup stay at the end of the delivery sequence.

## Existing capabilities reused

- Google Business / Reviews: existing workspace-scoped profiles, review import/replies, request pages, feedback forms and review tools.
- Website: existing Digital Card editor, public card route and lead capture. A full multi-page site builder is a separate parity item.
- Catalogue: existing categories/products, stock, coupons, public storefront, cart/wishlist and atomic checkout.
- WhatsApp CRM: existing inbox, contacts, approved templates, campaigns, bot flows and CRM sync. Live Meta onboarding/provider verification remains pending.
- Analytics: existing workspace analytics and dashboard metrics. Missing provider data must remain visibly unavailable, never be replaced with demo totals.

## Added in this parity pass

### POS / Orders
- Additive order_channel, order_type, table_label and pos_table_id metadata to catalogue orders.
- Database transaction prices products from the workspace catalogue, locks stock rows, rejects insufficient stock and writes an order plus line items atomically.
- Manager-only API creates counter, dine-in and takeaway bills; paid/pending payment status is recorded.
- Kitchen states include pending, preparing, ready and served while retaining existing online order states.
- Workspace-scoped restaurant table records each receive a unique QR token.
- Public table QR menu resolves the table token server-side, lists active/available products only, and sends an unpaid dine-in order into the same order/kitchen flow.
- The existing CRM order-sync trigger continues to record catalogue/POS orders in CRM. Confirm this is the desired reporting behavior during acceptance testing.

### Loyalty
- Workspace-scoped programmes, members and stamp/reward transaction ledger.
- Configurable stamp threshold and reward description.
- Manager can enrol customers, add stamps and redeem rewards.
- Database row locks keep stamp progression and reward redemption atomic.
- The loyalty migration is committed in this branch only and is not yet applied to the live Supabase database.

### Smart QR
- Existing review QR management uses the workspace's Google Business profile and active feedback form.
- Review QR scan creates a new review request and opens the existing public feedback page.
- Restaurant table/menu QR management is provided in Orders & POS and points to the public table menu.

## Still required to reach full reference parity

- A full multi-page website builder (beyond the existing Digital Card).
- GST/tax settings, invoice numbering rules, invoice PDF/thermal receipt refinements and payment mode reconciliation for POS.
- Restaurant table status/seat management, kitchen display auto-refresh/realtime and order status notifications.
- Unified QR designer / QR hub for website, Google reviews, digital card, table menu and offer links.
- Loyalty joining by QR and customer-facing stamp/reward wallet.
- Deeper Google Business rank tracking and profile audit parity where provider data/API availability permits.
- WhatsApp live onboarding, templates, webhooks and real delivery tests (provider connection stays last).
- Full authenticated desktop/mobile browser tests, workspace A/B isolation tests, Supabase migration application/review and post-deploy runtime verification.

## Release rules

- Keep all additional social publishing and advanced CRM features in the codebase, but out of the primary ten-item navigation for this first-look product.
- Do not delete their routes, records or APIs merely to simplify the menu.
- Do not apply migrations to production until PR review, migration review and a deployment plan are complete.
- A page or database object is not "complete" until its user flow, persistence, workspace isolation and error states have been tested.
