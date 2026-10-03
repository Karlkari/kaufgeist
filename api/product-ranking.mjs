const COMMON_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'einer', 'eines',
  'mit', 'und', 'fur', 'fuer', 'von', 'pro', 'plus', 'neu', 'new', 'inkl',
]);

const ACCESSORY_TERMS = [
  'hulle', 'tasche', 'sleeve', 'case', 'cover', 'schutzfolie', 'displayfolie',
  'dockingstation', 'dock', 'stander', 'halterung', 'kabel', 'ersatzteil',
];

const ACCESSORY_PHRASES = [
  'netzteil fur', 'ladegerat fur', 'adapter fur', 'akku fur',
  'batterie fur', 'tastatur fur', 'maus fur',
];

const CONDITION_TERMS = ['gebraucht', 'generaluberholt', 'refurbished', 'renewed'];

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function uniqueTokens(value) {
  return [...new Set(normalizeText(value).split(/\s+/).filter((token) => token.length > 1 && !COMMON_WORDS.has(token)))];
}

function normalizeKeywords(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function expandCategoryKeywords(requirements) {
  const normalized = normalizeKeywords([
    requirements?.category,
    ...(Array.isArray(requirements?.categoryKeywords) ? requirements.categoryKeywords : []),
  ]);
  const individualWords = normalized
    .flatMap((keyword) => keyword.split(/\s+/))
    .filter((word) => word.length > 2 && !COMMON_WORDS.has(word) && !/^\d+$/.test(word));
  return [...new Set([...normalized, ...individualWords])];
}

export function parseProductPrice(value) {
  let price = String(value || '').replace(/[^0-9.,]/g, '');
  if (!price) return null;

  const comma = price.lastIndexOf(',');
  const dot = price.lastIndexOf('.');

  if (comma !== -1 && dot !== -1) {
    const decimalSeparator = comma > dot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    price = price.replaceAll(thousandsSeparator, '').replace(decimalSeparator, '.');
  } else {
    const separator = comma !== -1 ? ',' : dot !== -1 ? '.' : null;
    if (separator) {
      const parts = price.split(separator);
      const decimalDigits = parts.at(-1)?.length || 0;
      price = decimalDigits === 2
        ? `${parts.slice(0, -1).join('')}.${parts.at(-1)}`
        : parts.join('');
    }
  }

  const parsed = Number(price);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function extractLatestBudget(messages) {
  let latestBudget = null;
  const patterns = [
    /(?:budget(?:\s+von)?|preisrahmen)\s*[:=]?\s*(\d[\d.,]*)\s*(?:€|euro)?/i,
    /(?:bis(?:\s+zu)?|max(?:imal)?\.?|hoechstens|höchstens|unter)\s*(\d[\d.,]*)\s*(?:€|euro)?/i,
    /(\d[\d.,]*)\s*(?:€|euro)\s*(?:maximal|höchstens|hoechstens)?/i,
  ];
  const measurementAfterMatch = /^[\s-]*(?:zoll|cm|mm|kg|gb|tb|watt)\b/i;

  (Array.isArray(messages) ? messages : []).forEach((message) => {
    if (message?.role !== 'user' || typeof message.content !== 'string') return;
    for (const pattern of patterns) {
      const match = message.content.match(pattern);
      if (!match) continue;
      const remainder = message.content.slice((match.index || 0) + match[0].length);
      if (measurementAfterMatch.test(remainder)) continue;
      const amount = parseProductPrice(match[1]);
      if (amount !== null) latestBudget = amount;
      break;
    }
  });

  return latestBudget;
}

function containsKeyword(title, keyword) {
  return title === keyword || title.startsWith(`${keyword} `) || title.endsWith(` ${keyword}`) || title.includes(` ${keyword} `);
}

function looksLikeAccessory(title) {
  return ACCESSORY_TERMS.some((term) => containsKeyword(title, term))
    || ACCESSORY_PHRASES.some((phrase) => title.includes(phrase));
}

function productIdentity(item) {
  if (item?.asin) return `asin:${String(item.asin).toLowerCase()}`;
  if (item?.product_url) {
    try {
      const url = new URL(item.product_url);
      return `url:${url.hostname}${url.pathname}`.toLowerCase();
    } catch (_) {}
  }
  return `title:${normalizeText(item?.product_title)}`;
}

function titleMatchScore(recommendation, title, preferenceKeywords) {
  const normalizedName = normalizeText(recommendation?.name);
  const nameTokens = uniqueTokens(recommendation?.name);
  let score = normalizedName && title.includes(normalizedName) ? 12 : 0;
  let matchedWeight = 0;
  let possibleWeight = 0;

  nameTokens.forEach((token, index) => {
    const weight = /\d/.test(token) ? 4 : index === 0 ? 3 : token.length >= 6 ? 2 : 1;
    possibleWeight += weight;
    if (containsKeyword(title, token)) {
      matchedWeight += weight;
      score += weight;
    }
  });

  preferenceKeywords.forEach((keyword) => {
    if (title.includes(keyword)) score += 1;
  });

  return {
    score,
    matchedWeight,
    minimumWeight: Math.max(3, Math.ceil(possibleWeight * 0.5)),
  };
}

export function rankProductCandidates(recommendation, items, requirements = {}) {
  const categoryKeywords = expandCategoryKeywords(requirements);
  const preferenceKeywords = normalizeKeywords(requirements.preferenceKeywords);
  const excludedKeywords = normalizeKeywords(requirements.excludedKeywords);
  const maximumPrice = Number(requirements.maxPrice);
  const hasMaximumPrice = Number.isFinite(maximumPrice) && maximumPrice > 0;

  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const title = normalizeText(item?.product_title);
      const price = parseProductPrice(item?.product_price);
      const match = titleMatchScore(recommendation, title, preferenceKeywords);
      const rating = Number(item?.product_star_rating) || 0;
      return {
        item,
        identity: productIdentity(item),
        price,
        score: match.score + Math.min(Math.max(rating, 0), 5) * 0.05,
        matchedWeight: match.matchedWeight,
        minimumWeight: match.minimumWeight,
        categoryMatch: categoryKeywords.length === 0 || categoryKeywords.some((keyword) => title.includes(keyword)),
        excluded: excludedKeywords.some((keyword) => title.includes(keyword)),
        accessory: looksLikeAccessory(title),
        conditionMismatch: requirements.allowUsed !== true && CONDITION_TERMS.some((term) => title.includes(term)),
      };
    })
    .filter((candidate) => candidate.item?.product_url)
    .filter((candidate) => candidate.price !== null)
    .filter((candidate) => !hasMaximumPrice || candidate.price <= maximumPrice)
    .filter((candidate) => candidate.categoryMatch)
    .filter((candidate) => !candidate.excluded && !candidate.accessory && !candidate.conditionMismatch)
    .filter((candidate) => candidate.matchedWeight >= candidate.minimumWeight)
    .sort((a, b) => b.score - a.score || a.price - b.price);
}

export function selectUniqueProduct(candidateGroups, maximum = 3) {
  const selected = [];
  const used = new Set();

  for (const group of Array.isArray(candidateGroups) ? candidateGroups : []) {
    const candidate = (group?.candidates || []).find((entry) => !used.has(entry.identity));
    if (!candidate) continue;
    used.add(candidate.identity);
    selected.push({ recommendation: group.recommendation, candidate });
    if (selected.length >= maximum) break;
  }

  return selected;
}
