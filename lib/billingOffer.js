// lib/billingOffer.js
//
// Bug batch 1 audit, item 8 (session_addendum_bug_batch_1.md): what the
// Settings page offers to sell, built from the real sources instead of
// strings hardcoded in archive/settings.html ("Subscribe -- $4.99/month
// (50 generations + 10 images/mo...)", "5 credits -- $2", "+25 entries --
// $5"). Quotas come from the `plans` row; prices come from the Stripe
// Price objects themselves (plans has no price column, and Stripe is what
// actually charges), so a plan or price change can't leave Settings
// advertising the wrong numbers.
//
// Stripe price lookups are cached in-process for an hour (a failure for
// five minutes) -- /billing/status is loaded on every page, and prices
// change rarely. A failed lookup yields price: null; the UI then shows
// the offer without a price rather than a wrong one.
//
// Pack sizes live here (single source): routes/stripeWebhook.js imports
// them to decide how much a purchase grants, so the number Settings shows
// and the number actually granted can't drift apart.

const CREDITS_PER_PACK_UNIT = 5;   // generations per credit-pack unit
const ENTRIES_PER_PACK_UNIT = 25;  // entries per entry-pack unit

const PRICE_TTL_MS = 60 * 60 * 1000;
const PRICE_FAILURE_TTL_MS = 5 * 60 * 1000;
const priceCache = new Map(); // priceId -> { value, expiresAt }

function formatMoney(unitAmount, currency) {
  if (!Number.isInteger(unitAmount) || !currency) return null;
  try {
    const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(unitAmount / 100);
    return formatted.replace(/\.00$/, ""); // "$2", "$4.99"
  } catch (_err) {
    return null;
  }
}

// { label: "$4.99", unitAmount, currency, interval: "month"|null } or null.
async function getPriceInfo(stripe, priceId, now = Date.now()) {
  if (!priceId) return null;
  const cached = priceCache.get(priceId);
  if (cached && cached.expiresAt > now) return cached.value;
  let value = null;
  let ttl = PRICE_FAILURE_TTL_MS;
  try {
    const price = await stripe.prices.retrieve(priceId);
    const label = formatMoney(price.unit_amount, price.currency);
    if (label) {
      value = { label, unitAmount: price.unit_amount, currency: price.currency, interval: (price.recurring && price.recurring.interval) || null };
      ttl = PRICE_TTL_MS;
    }
  } catch (err) {
    console.error(`Looking up Stripe price ${priceId} failed:`, err.message);
  }
  priceCache.set(priceId, { value, expiresAt: now + ttl });
  return value;
}

// `plan` is the plans row (routes/billing.js reads it); `pointsPerGeneration`
// converts its points-denominated quota to generations for display.
async function getBillingOffer({ stripe, plan, pointsPerGeneration, creditPriceId, entryPackPriceId }) {
  const [subPrice, creditPrice, entryPrice] = await Promise.all([
    plan ? getPriceInfo(stripe, plan.stripe_price_id) : null,
    getPriceInfo(stripe, creditPriceId),
    getPriceInfo(stripe, entryPackPriceId)
  ]);
  return {
    subscription: plan ? {
      name: plan.name,
      generationsPerMonth: Math.floor((plan.monthly_quota || 0) / pointsPerGeneration),
      imagesPerMonth: plan.monthly_quota_images || 0,
      price: subPrice ? subPrice.label : null,
      interval: subPrice ? subPrice.interval : null
    } : null,
    creditPack: { generationsPerUnit: CREDITS_PER_PACK_UNIT, unitAmount: creditPrice ? creditPrice.unitAmount : null, currency: creditPrice ? creditPrice.currency : null },
    entryPack: { entriesPerUnit: ENTRIES_PER_PACK_UNIT, unitAmount: entryPrice ? entryPrice.unitAmount : null, currency: entryPrice ? entryPrice.currency : null }
  };
}

function _clearPriceCacheForTests() { priceCache.clear(); }

module.exports = { getBillingOffer, getPriceInfo, formatMoney, CREDITS_PER_PACK_UNIT, ENTRIES_PER_PACK_UNIT, _clearPriceCacheForTests };
