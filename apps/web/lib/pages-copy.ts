import type { MarketingLocale } from './marketing-locales';

/**
 * The words around the catalogue, the roadmap and the changelog: headings,
 * column names, the states a model can be in, the filters.
 *
 * In the five languages the public site speaks, and nothing else. What is
 * drawn inside them is not translated: a model's name and id, the provider's
 * own words about a retirement, the catalogue's notes, the roadmap's and the
 * changelog's prose are the repository's English, and each page says so in
 * the reader's language. The type is the parity check the compiler runs and
 * `site-pages.test.mjs` checks that each string is there and not empty. French,
 * German and Portuguese are machine-drafted and unreviewed, as the banner the
 * site shows in them says.
 */
export interface ModelsCopy {
  metaTitle: string;
  metaDescription: string;
  title: string;
  lede: string;
  /** Said when the site is not in English: the figures are the catalogue's, the words in it English. */
  englishNote: string;
  /** "Oldest provider date" line over the table. */
  reviewedLine: (date: string) => string;
  /** What the figures are and are not. */
  rule: string;
  providerFilter: string;
  allProviders: string;
  textFilter: string;
  textPlaceholder: string;
  status: (shown: number, total: number) => string;
  none: string;
  tableLabel: (provider: string) => string;
  columns: { model: string; input: string; output: string; context: string; cacheRead: string; batch: string };
  /** Under the column heads: what a rate is a rate of. */
  perMTok: string;
  states: {
    retired: string;
    promo: (until: string) => string;
    unpriced: string;
    notOffered: string;
    repriced: string;
  };
  noPrice: string;
  noBatch: string;
  caching: { explicit: string; automatic: string; none: string; unknown: string };
  cacheMin: (tokens: string) => string;
  cacheWrite: (multiplier: string, minutes: number) => string;
  details: string;
  detail: {
    retiredOn: (date: string) => string;
    providerAnswered: string;
    promo: string;
    promoUntil: (date: string) => string;
    promoConfirmed: (date: string) => string;
    bands: string;
    serviceTiers: string;
    history: string;
    historyUntil: (instant: string) => string;
    geo: string;
    webSearch: string;
    perThousand: string;
    aliases: string;
    notes: string;
    cache: string;
    rowRates: string;
  };
  when: {
    speed: (speed: string) => string;
    above: (tokens: string) => string;
    atLeast: (tokens: string) => string;
    hours: (hours: string, weekdaysOnly: boolean) => string;
  };
  provider: {
    reviewed: (date: string) => string;
    notReviewed: string;
    source: string;
    noSource: string;
    count: (models: number) => string;
  };
  unpricedTitle: string;
  unpricedLede: string;
  sourcesTitle: string;
  sourcesLede: string;
  catalogueOnGitHub: string;
  reportPrice: string;
  /** Names the band that follows a promotion or retirement tag in the key. */
  keyTitle: string;
  keyLede: string;
}

export interface RoadmapCopy {
  metaTitle: string;
  metaDescription: string;
  title: string;
  lede: string;
  englishNote: string;
  noDates: string;
  milestonesTitle: string;
  milestonesLede: string;
  position: (n: number) => string;
  issues: (n: number) => string;
  noIssues: string;
  openMilestone: string;
  titlesNote: string;
  considerationTitle: string;
  considerationLede: string;
  /** Shown when ROADMAP.md has no section by that name. */
  considerationMissing: string;
  viewOnGitHub: string;
}

export interface ChangelogCopy {
  metaTitle: string;
  metaDescription: string;
  title: string;
  lede: string;
  englishNote: string;
  unreleased: string;
  unreleasedLede: string;
  allReleases: string;
  count: (n: number) => string;
  drawnBelow: (n: number) => string;
  ownPage: string;
  inFull: string;
  readRelease: string;
  dateOf: (date: string) => string;
  notDated: string;
  newer: string;
  older: string;
  allReleasesLink: string;
  viewOnGitHub: string;
  breadcrumb: string;
  onThisPage: string;
  releasePageTitle: (version: string) => string;
}

export const MODELS_COPY: Record<MarketingLocale, ModelsCopy> = {
  en: {
    metaTitle: 'Models and prices',
    metaDescription:
      'Every model Trazum prices, with its rates and the date each provider’s prices were last read. The page is the catalogue the product bills with, built from it.',
    title: 'Models and prices',
    lede: 'Every model the catalogue prices, grouped by provider, with the rates the product bills with and the date each provider’s page was last read.',
    englishNote: 'The figures are the catalogue’s. Names, notes and the providers’ own words are in English in every language.',
    reviewedLine: (date) => `Oldest provider review: ${date}`,
    rule: 'Rates are US dollars per million tokens, as the catalogue holds them. Nothing on this page is computed: a cache or batch price is shown as the multiple the catalogue states, not as a figure.',
    providerFilter: 'Provider',
    allProviders: 'All providers',
    textFilter: 'Filter models',
    textPlaceholder: 'Filter by name or id',
    status: (shown, total) => `Showing ${shown} of ${total} models`,
    none: 'No model matches. Try a shorter word or all providers.',
    tableLabel: (provider) => `${provider} models and rates`,
    columns: { model: 'Model', input: 'Input', output: 'Output', context: 'Context', cacheRead: 'Cache read', batch: 'Batch' },
    perMTok: 'per 1M tokens',
    states: {
      retired: 'Retired',
      promo: (until) => `Promotional until ${until}`,
      unpriced: 'No price',
      notOffered: 'Not offered as an alternative',
      repriced: 'Repriced',
    },
    noPrice: 'No price',
    noBatch: 'No batch API',
    caching: { explicit: 'Caching: marked by the caller', automatic: 'Caching: automatic', none: 'No prompt caching', unknown: 'Caching not known' },
    cacheMin: (tokens) => `from ${tokens} tokens`,
    cacheWrite: (multiplier, minutes) => `write ${multiplier} for ${minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}`,
    details: 'Bands, tiers and notes',
    detail: {
      retiredOn: (date) => `Refused by the provider on ${date}`,
      providerAnswered: 'The provider answered',
      promo: 'Promotional rate',
      promoUntil: (date) => `until ${date}, inclusive`,
      promoConfirmed: (date) => `still stated by the provider’s page on ${date}`,
      bands: 'Bands',
      serviceTiers: 'Service tiers',
      history: 'Earlier rates',
      historyUntil: (instant) => `until ${instant}`,
      geo: 'Inference geography',
      webSearch: 'Web search',
      perThousand: 'per 1,000 searches',
      aliases: 'Also billed as',
      notes: 'Catalogue note',
      cache: 'Cache',
      rowRates: 'The rates in the row apply after the last earlier period.',
    },
    when: {
      speed: (speed) => `Fast mode (usage.speed “${speed}”)`,
      above: (tokens) => `Prompt above ${tokens} input tokens`,
      atLeast: (tokens) => `Prompt of ${tokens} input tokens or more`,
      hours: (hours, weekdaysOnly) => `UTC hours ${hours}${weekdaysOnly ? ', Monday to Friday' : ''}`,
    },
    provider: {
      reviewed: (date) => `Prices last read ${date}`,
      notReviewed: 'No review date recorded',
      source: 'Page read',
      noSource: 'The catalogue names no page',
      count: (models) => (models === 1 ? '1 model' : `${models} models`),
    },
    unpricedTitle: 'Listed by a provider, not priced here',
    unpricedLede: 'These ids are on a provider’s own page and are left out of the catalogue on purpose, each for the reason beside it. A call to one reads as unpriced. It is never given a figure borrowed from another model.',
    sourcesTitle: 'Where each price was read',
    sourcesLede: 'A price is read from the provider’s page on a date, never remembered or worked out. These are the pages the catalogue names, and the date it last read each provider.',
    catalogueOnGitHub: 'The catalogue on GitHub',
    reportPrice: 'Report a wrong price',
    keyTitle: 'How to read a row',
    keyLede: 'Retired: the provider refused a real request for the id, so it keeps its price for the logs that used it and is never recommended. Promotional: a time-limited rate, with its end date. No price: the catalogue holds none, and the page shows none.',
  },
  es: {
    metaTitle: 'Modelos y precios',
    metaDescription:
      'Cada modelo que Trazum tarifica, con sus precios y la fecha en que se leyeron por última vez los de cada proveedor. La página es el catálogo con el que factura el producto, construida desde él.',
    title: 'Modelos y precios',
    lede: 'Cada modelo que tarifica el catálogo, agrupado por proveedor, con los precios con los que factura el producto y la fecha en que se leyó por última vez la página de cada proveedor.',
    englishNote: 'Las cifras son las del catálogo. Los nombres, las notas y las palabras de los proveedores están en inglés en todos los idiomas.',
    reviewedLine: (date) => `Revisión más antigua de un proveedor: ${date}`,
    rule: 'Los precios son dólares por millón de tokens, tal como los guarda el catálogo. Nada en esta página se calcula: el precio de caché o de lote se muestra como el múltiplo que declara el catálogo, no como una cifra.',
    providerFilter: 'Proveedor',
    allProviders: 'Todos los proveedores',
    textFilter: 'Filtrar modelos',
    textPlaceholder: 'Filtrar por nombre o id',
    status: (shown, total) => `Mostrando ${shown} de ${total} modelos`,
    none: 'Ningún modelo coincide. Prueba una palabra más corta o todos los proveedores.',
    tableLabel: (provider) => `Modelos y precios de ${provider}`,
    columns: { model: 'Modelo', input: 'Entrada', output: 'Salida', context: 'Contexto', cacheRead: 'Lectura de caché', batch: 'Lote' },
    perMTok: 'por 1M de tokens',
    states: {
      retired: 'Retirado',
      promo: (until) => `Promocional hasta ${until}`,
      unpriced: 'Sin precio',
      notOffered: 'No se ofrece como alternativa',
      repriced: 'Con precio cambiado',
    },
    noPrice: 'Sin precio',
    noBatch: 'Sin API de lotes',
    caching: { explicit: 'Caché: la marca quien llama', automatic: 'Caché: automática', none: 'Sin caché de prompts', unknown: 'Caché desconocida' },
    cacheMin: (tokens) => `desde ${tokens} tokens`,
    cacheWrite: (multiplier, minutes) => `escritura ${multiplier} durante ${minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}`,
    details: 'Tramos, niveles y notas',
    detail: {
      retiredOn: (date) => `Rechazado por el proveedor el ${date}`,
      providerAnswered: 'El proveedor respondió',
      promo: 'Precio promocional',
      promoUntil: (date) => `hasta el ${date}, inclusive`,
      promoConfirmed: (date) => `la página del proveedor lo seguía indicando el ${date}`,
      bands: 'Tramos',
      serviceTiers: 'Niveles de servicio',
      history: 'Precios anteriores',
      historyUntil: (instant) => `hasta ${instant}`,
      geo: 'Geografía de la inferencia',
      webSearch: 'Búsqueda web',
      perThousand: 'por cada 1.000 búsquedas',
      aliases: 'También se factura como',
      notes: 'Nota del catálogo',
      cache: 'Caché',
      rowRates: 'Los precios de la fila rigen después del último periodo anterior.',
    },
    when: {
      speed: (speed) => `Modo rápido (usage.speed “${speed}”)`,
      above: (tokens) => `Prompt de más de ${tokens} tokens de entrada`,
      atLeast: (tokens) => `Prompt de ${tokens} tokens de entrada o más`,
      hours: (hours, weekdaysOnly) => `Horas UTC ${hours}${weekdaysOnly ? ', de lunes a viernes' : ''}`,
    },
    provider: {
      reviewed: (date) => `Precios leídos el ${date}`,
      notReviewed: 'Sin fecha de revisión registrada',
      source: 'Página leída',
      noSource: 'El catálogo no nombra ninguna página',
      count: (models) => (models === 1 ? '1 modelo' : `${models} modelos`),
    },
    unpricedTitle: 'En la lista de un proveedor, sin precio aquí',
    unpricedLede: 'Estos ids están en la página del proveedor y el catálogo los deja fuera a propósito, cada uno por el motivo que figura al lado. Una llamada a uno se lee como sin precio. Nunca se le da una cifra prestada de otro modelo.',
    sourcesTitle: 'Dónde se leyó cada precio',
    sourcesLede: 'Un precio se lee de la página del proveedor en una fecha, nunca de memoria ni calculado. Estas son las páginas que nombra el catálogo y la fecha en que leyó por última vez a cada proveedor.',
    catalogueOnGitHub: 'El catálogo en GitHub',
    reportPrice: 'Informar de un precio erróneo',
    keyTitle: 'Cómo leer una fila',
    keyLede: 'Retirado: el proveedor rechazó una petición real con ese id, así que conserva su precio para los registros que lo usaron y nunca se recomienda. Promocional: una tarifa limitada en el tiempo, con su fecha de fin. Sin precio: el catálogo no tiene ninguno y la página no muestra ninguno.',
  },
  fr: {
    metaTitle: 'Modèles et tarifs',
    metaDescription:
      'Chaque modèle que Trazum tarife, avec ses tarifs et la date de dernière lecture de ceux de chaque fournisseur. La page est le catalogue avec lequel le produit facture, construite à partir de lui.',
    title: 'Modèles et tarifs',
    lede: 'Chaque modèle que tarife le catalogue, regroupé par fournisseur, avec les tarifs de facturation du produit et la date de dernière lecture de la page de chaque fournisseur.',
    englishNote: 'Les chiffres sont ceux du catalogue. Les noms, les notes et les mots des fournisseurs restent en anglais dans toutes les langues.',
    reviewedLine: (date) => `Révision la plus ancienne d’un fournisseur : ${date}`,
    rule: 'Les tarifs sont en dollars américains par million de jetons, tels que le catalogue les conserve. Rien sur cette page n’est calculé : un prix de cache ou de lot est montré comme le multiple que donne le catalogue, pas comme un chiffre.',
    providerFilter: 'Fournisseur',
    allProviders: 'Tous les fournisseurs',
    textFilter: 'Filtrer les modèles',
    textPlaceholder: 'Filtrer par nom ou id',
    status: (shown, total) => `${shown} modèles affichés sur ${total}`,
    none: 'Aucun modèle ne correspond. Essayez un mot plus court ou tous les fournisseurs.',
    tableLabel: (provider) => `Modèles et tarifs de ${provider}`,
    columns: { model: 'Modèle', input: 'Entrée', output: 'Sortie', context: 'Contexte', cacheRead: 'Lecture du cache', batch: 'Lot' },
    perMTok: 'par million de jetons',
    states: {
      retired: 'Retiré',
      promo: (until) => `Promotionnel jusqu’au ${until}`,
      unpriced: 'Sans tarif',
      notOffered: 'Non proposé comme alternative',
      repriced: 'Tarif modifié',
    },
    noPrice: 'Sans tarif',
    noBatch: 'Pas d’API de lots',
    caching: { explicit: 'Cache : marqué par l’appelant', automatic: 'Cache : automatique', none: 'Pas de cache de prompt', unknown: 'Cache inconnu' },
    cacheMin: (tokens) => `à partir de ${tokens} jetons`,
    cacheWrite: (multiplier, minutes) => `écriture ${multiplier} pendant ${minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}`,
    details: 'Paliers, niveaux et notes',
    detail: {
      retiredOn: (date) => `Refusé par le fournisseur le ${date}`,
      providerAnswered: 'Le fournisseur a répondu',
      promo: 'Tarif promotionnel',
      promoUntil: (date) => `jusqu’au ${date}, inclus`,
      promoConfirmed: (date) => `encore indiqué par la page du fournisseur le ${date}`,
      bands: 'Paliers',
      serviceTiers: 'Niveaux de service',
      history: 'Tarifs antérieurs',
      historyUntil: (instant) => `jusqu’à ${instant}`,
      geo: 'Zone d’inférence',
      webSearch: 'Recherche web',
      perThousand: 'pour 1 000 recherches',
      aliases: 'Aussi facturé comme',
      notes: 'Note du catalogue',
      cache: 'Cache',
      rowRates: 'Les tarifs de la ligne s’appliquent après la dernière période antérieure.',
    },
    when: {
      speed: (speed) => `Mode rapide (usage.speed « ${speed} »)`,
      above: (tokens) => `Prompt de plus de ${tokens} jetons d’entrée`,
      atLeast: (tokens) => `Prompt de ${tokens} jetons d’entrée ou plus`,
      hours: (hours, weekdaysOnly) => `Heures UTC ${hours}${weekdaysOnly ? ', du lundi au vendredi' : ''}`,
    },
    provider: {
      reviewed: (date) => `Tarifs lus le ${date}`,
      notReviewed: 'Aucune date de révision enregistrée',
      source: 'Page lue',
      noSource: 'Le catalogue ne nomme aucune page',
      count: (models) => (models === 1 ? '1 modèle' : `${models} modèles`),
    },
    unpricedTitle: 'Listé par un fournisseur, sans tarif ici',
    unpricedLede: 'Ces ids figurent sur la page d’un fournisseur et le catalogue les laisse de côté exprès, chacun pour la raison indiquée. Un appel à l’un d’eux se lit comme sans tarif. On ne lui prête jamais le chiffre d’un autre modèle.',
    sourcesTitle: 'Où chaque tarif a été lu',
    sourcesLede: 'Un tarif est lu sur la page du fournisseur à une date, jamais retenu de mémoire ni calculé. Voici les pages que nomme le catalogue et la date de dernière lecture de chaque fournisseur.',
    catalogueOnGitHub: 'Le catalogue sur GitHub',
    reportPrice: 'Signaler un tarif erroné',
    keyTitle: 'Lire une ligne',
    keyLede: 'Retiré : le fournisseur a refusé une vraie requête avec cet id ; il garde son tarif pour les journaux qui l’ont utilisé et n’est jamais recommandé. Promotionnel : un tarif limité dans le temps, avec sa date de fin. Sans tarif : le catalogue n’en a aucun et la page n’en montre aucun.',
  },
  de: {
    metaTitle: 'Modelle und Preise',
    metaDescription:
      'Jedes Modell, das Trazum bepreist, mit seinen Preisen und dem Datum, an dem die Preise jedes Anbieters zuletzt gelesen wurden. Die Seite ist der Katalog, mit dem das Produkt abrechnet, aus ihm gebaut.',
    title: 'Modelle und Preise',
    lede: 'Jedes Modell, das der Katalog bepreist, nach Anbieter gruppiert, mit den Preisen, mit denen das Produkt abrechnet, und dem Datum, an dem die Seite jedes Anbieters zuletzt gelesen wurde.',
    englishNote: 'Die Zahlen sind die des Katalogs. Namen, Hinweise und die Worte der Anbieter bleiben in allen Sprachen englisch.',
    reviewedLine: (date) => `Älteste Prüfung eines Anbieters: ${date}`,
    rule: 'Preise sind US-Dollar pro Million Tokens, wie der Katalog sie führt. Nichts auf dieser Seite wird berechnet: ein Cache- oder Batch-Preis steht als das Vielfache, das der Katalog angibt, nicht als Zahl.',
    providerFilter: 'Anbieter',
    allProviders: 'Alle Anbieter',
    textFilter: 'Modelle filtern',
    textPlaceholder: 'Nach Name oder ID filtern',
    status: (shown, total) => `${shown} von ${total} Modellen angezeigt`,
    none: 'Kein Modell passt. Versuchen Sie ein kürzeres Wort oder alle Anbieter.',
    tableLabel: (provider) => `Modelle und Preise von ${provider}`,
    columns: { model: 'Modell', input: 'Eingabe', output: 'Ausgabe', context: 'Kontext', cacheRead: 'Cache-Lesen', batch: 'Batch' },
    perMTok: 'pro 1 Mio. Tokens',
    states: {
      retired: 'Eingestellt',
      promo: (until) => `Aktionspreis bis ${until}`,
      unpriced: 'Kein Preis',
      notOffered: 'Nicht als Alternative angeboten',
      repriced: 'Preis geändert',
    },
    noPrice: 'Kein Preis',
    noBatch: 'Keine Batch-API',
    caching: { explicit: 'Caching: vom Aufrufer markiert', automatic: 'Caching: automatisch', none: 'Kein Prompt-Caching', unknown: 'Caching unbekannt' },
    cacheMin: (tokens) => `ab ${tokens} Tokens`,
    cacheWrite: (multiplier, minutes) => `Schreiben ${multiplier} für ${minutes < 60 ? `${minutes} Min.` : `${minutes / 60} Std.`}`,
    details: 'Stufen, Tarife und Hinweise',
    detail: {
      retiredOn: (date) => `Vom Anbieter am ${date} abgelehnt`,
      providerAnswered: 'Der Anbieter antwortete',
      promo: 'Aktionspreis',
      promoUntil: (date) => `bis ${date}, einschließlich`,
      promoConfirmed: (date) => `am ${date} noch auf der Seite des Anbieters genannt`,
      bands: 'Stufen',
      serviceTiers: 'Service-Stufen',
      history: 'Frühere Preise',
      historyUntil: (instant) => `bis ${instant}`,
      geo: 'Region der Inferenz',
      webSearch: 'Websuche',
      perThousand: 'pro 1.000 Suchen',
      aliases: 'Wird auch abgerechnet als',
      notes: 'Hinweis des Katalogs',
      cache: 'Cache',
      rowRates: 'Die Preise der Zeile gelten nach dem letzten früheren Zeitraum.',
    },
    when: {
      speed: (speed) => `Schnellmodus (usage.speed „${speed}“)`,
      above: (tokens) => `Prompt über ${tokens} Eingabe-Tokens`,
      atLeast: (tokens) => `Prompt ab ${tokens} Eingabe-Tokens`,
      hours: (hours, weekdaysOnly) => `UTC-Stunden ${hours}${weekdaysOnly ? ', Montag bis Freitag' : ''}`,
    },
    provider: {
      reviewed: (date) => `Preise gelesen am ${date}`,
      notReviewed: 'Kein Prüfdatum erfasst',
      source: 'Gelesene Seite',
      noSource: 'Der Katalog nennt keine Seite',
      count: (models) => (models === 1 ? '1 Modell' : `${models} Modelle`),
    },
    unpricedTitle: 'Von einem Anbieter gelistet, hier ohne Preis',
    unpricedLede: 'Diese IDs stehen auf der Seite eines Anbieters und fehlen im Katalog absichtlich, jede aus dem Grund daneben. Ein Aufruf liest sich als ohne Preis. Eine von einem anderen Modell geliehene Zahl bekommt er nie.',
    sourcesTitle: 'Wo jeder Preis gelesen wurde',
    sourcesLede: 'Ein Preis wird an einem Datum von der Seite des Anbieters gelesen, nie aus dem Gedächtnis oder berechnet. Das sind die Seiten, die der Katalog nennt, und das Datum der letzten Lesung je Anbieter.',
    catalogueOnGitHub: 'Der Katalog auf GitHub',
    reportPrice: 'Falschen Preis melden',
    keyTitle: 'Eine Zeile lesen',
    keyLede: 'Eingestellt: Der Anbieter hat eine echte Anfrage mit dieser ID abgelehnt; sie behält ihren Preis für die Logs, die sie nutzten, und wird nie empfohlen. Aktionspreis: ein befristeter Preis mit Enddatum. Kein Preis: Der Katalog hat keinen, und die Seite zeigt keinen.',
  },
  pt: {
    metaTitle: 'Modelos e preços',
    metaDescription:
      'Cada modelo que o Trazum tarifa, com os seus preços e a data em que os de cada fornecedor foram lidos pela última vez. A página é o catálogo com que o produto fatura, construída a partir dele.',
    title: 'Modelos e preços',
    lede: 'Cada modelo que o catálogo tarifa, agrupado por fornecedor, com os preços com que o produto fatura e a data em que a página de cada fornecedor foi lida pela última vez.',
    englishNote: 'Os números são os do catálogo. Os nomes, as notas e as palavras dos fornecedores ficam em inglês em todos os idiomas.',
    reviewedLine: (date) => `Revisão mais antiga de um fornecedor: ${date}`,
    rule: 'Os preços são dólares americanos por milhão de tokens, como o catálogo os guarda. Nada nesta página é calculado: um preço de cache ou de lote aparece como o múltiplo que o catálogo declara, não como um valor.',
    providerFilter: 'Fornecedor',
    allProviders: 'Todos os fornecedores',
    textFilter: 'Filtrar modelos',
    textPlaceholder: 'Filtrar por nome ou id',
    status: (shown, total) => `A mostrar ${shown} de ${total} modelos`,
    none: 'Nenhum modelo corresponde. Tente uma palavra mais curta ou todos os fornecedores.',
    tableLabel: (provider) => `Modelos e preços de ${provider}`,
    columns: { model: 'Modelo', input: 'Entrada', output: 'Saída', context: 'Contexto', cacheRead: 'Leitura de cache', batch: 'Lote' },
    perMTok: 'por milhão de tokens',
    states: {
      retired: 'Retirado',
      promo: (until) => `Promocional até ${until}`,
      unpriced: 'Sem preço',
      notOffered: 'Não oferecido como alternativa',
      repriced: 'Preço alterado',
    },
    noPrice: 'Sem preço',
    noBatch: 'Sem API de lotes',
    caching: { explicit: 'Cache: marcada por quem chama', automatic: 'Cache: automática', none: 'Sem cache de prompts', unknown: 'Cache desconhecida' },
    cacheMin: (tokens) => `a partir de ${tokens} tokens`,
    cacheWrite: (multiplier, minutes) => `escrita ${multiplier} durante ${minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}`,
    details: 'Escalões, níveis e notas',
    detail: {
      retiredOn: (date) => `Recusado pelo fornecedor em ${date}`,
      providerAnswered: 'O fornecedor respondeu',
      promo: 'Preço promocional',
      promoUntil: (date) => `até ${date}, inclusive`,
      promoConfirmed: (date) => `ainda indicado na página do fornecedor em ${date}`,
      bands: 'Escalões',
      serviceTiers: 'Níveis de serviço',
      history: 'Preços anteriores',
      historyUntil: (instant) => `até ${instant}`,
      geo: 'Geografia da inferência',
      webSearch: 'Pesquisa web',
      perThousand: 'por 1.000 pesquisas',
      aliases: 'Também faturado como',
      notes: 'Nota do catálogo',
      cache: 'Cache',
      rowRates: 'Os preços da linha valem depois do último período anterior.',
    },
    when: {
      speed: (speed) => `Modo rápido (usage.speed “${speed}”)`,
      above: (tokens) => `Prompt acima de ${tokens} tokens de entrada`,
      atLeast: (tokens) => `Prompt de ${tokens} tokens de entrada ou mais`,
      hours: (hours, weekdaysOnly) => `Horas UTC ${hours}${weekdaysOnly ? ', de segunda a sexta' : ''}`,
    },
    provider: {
      reviewed: (date) => `Preços lidos em ${date}`,
      notReviewed: 'Sem data de revisão registada',
      source: 'Página lida',
      noSource: 'O catálogo não nomeia nenhuma página',
      count: (models) => (models === 1 ? '1 modelo' : `${models} modelos`),
    },
    unpricedTitle: 'Listado por um fornecedor, sem preço aqui',
    unpricedLede: 'Estes ids estão na página do fornecedor e o catálogo deixa-os de fora de propósito, cada um pelo motivo ao lado. Uma chamada a um deles lê-se como sem preço. Nunca lhe é dado um valor emprestado de outro modelo.',
    sourcesTitle: 'Onde cada preço foi lido',
    sourcesLede: 'Um preço é lido da página do fornecedor numa data, nunca de memória nem calculado. Estas são as páginas que o catálogo nomeia e a data da última leitura de cada fornecedor.',
    catalogueOnGitHub: 'O catálogo no GitHub',
    reportPrice: 'Comunicar um preço errado',
    keyTitle: 'Como ler uma linha',
    keyLede: 'Retirado: o fornecedor recusou um pedido real com esse id, por isso mantém o preço para os registos que o usaram e nunca é recomendado. Promocional: uma tarifa limitada no tempo, com a data de fim. Sem preço: o catálogo não tem nenhum e a página não mostra nenhum.',
  },
};

export const ROADMAP_COPY: Record<MarketingLocale, RoadmapCopy> = {
  en: {
    metaTitle: 'Roadmap',
    metaDescription: 'The milestones in the order the project commits to, each with its issues, and what is under consideration and not scheduled. No dates: the order is the commitment.',
    title: 'Roadmap',
    lede: 'Where the project is going, in order, with the work that belongs to each step. What is not scheduled is written down with the reasoning.',
    englishNote: 'The roadmap is in English. Only the navigation around it is translated.',
    noDates: 'There are no dates on this page, on purpose. The order is the commitment and the calendar is not.',
    milestonesTitle: 'In order',
    milestonesLede: 'The first is next. Each title opens the live milestone on GitHub, which holds the same issues.',
    position: (n) => `Milestone ${n}`,
    issues: (n) => (n === 1 ? '1 issue' : `${n} issues`),
    noIssues: 'No issues listed yet',
    openMilestone: 'Open the milestone on GitHub',
    titlesNote: 'An issue shows its title when the repository’s table of open work has it, and its number otherwise.',
    considerationTitle: 'Under consideration',
    considerationLede: 'Not scheduled, and kept so the reasoning is on the record.',
    considerationMissing: 'The roadmap has no such section at the moment.',
    viewOnGitHub: 'View on GitHub',
  },
  es: {
    metaTitle: 'Hoja de ruta',
    metaDescription: 'Los hitos en el orden al que se compromete el proyecto, cada uno con sus issues, y lo que se está considerando sin fecha. Sin fechas: el orden es el compromiso.',
    title: 'Hoja de ruta',
    lede: 'Hacia dónde va el proyecto, en orden, con el trabajo que pertenece a cada paso. Lo que no está programado se deja escrito con su razonamiento.',
    englishNote: 'La hoja de ruta está en inglés. Solo se traduce la navegación que la rodea.',
    noDates: 'En esta página no hay fechas, a propósito. El orden es el compromiso y el calendario no.',
    milestonesTitle: 'En orden',
    milestonesLede: 'El primero es el siguiente. Cada título abre el hito en GitHub, que reúne los mismos issues.',
    position: (n) => `Hito ${n}`,
    issues: (n) => (n === 1 ? '1 issue' : `${n} issues`),
    noIssues: 'Aún sin issues',
    openMilestone: 'Abrir el hito en GitHub',
    titlesNote: 'Un issue muestra su título cuando la tabla de trabajo abierto del repositorio lo tiene, y su número si no.',
    considerationTitle: 'En consideración',
    considerationLede: 'Sin programar, y escrito para que el razonamiento conste.',
    considerationMissing: 'Ahora mismo la hoja de ruta no tiene esa sección.',
    viewOnGitHub: 'Ver en GitHub',
  },
  fr: {
    metaTitle: 'Feuille de route',
    metaDescription: 'Les jalons dans l’ordre auquel le projet s’engage, chacun avec ses issues, et ce qui est à l’étude sans être planifié. Pas de dates : l’ordre est l’engagement.',
    title: 'Feuille de route',
    lede: 'Où va le projet, dans l’ordre, avec le travail propre à chaque étape. Ce qui n’est pas planifié est écrit avec son raisonnement.',
    englishNote: 'La feuille de route est en anglais. Seule la navigation autour est traduite.',
    noDates: 'Cette page ne porte aucune date, volontairement. L’ordre est l’engagement, pas le calendrier.',
    milestonesTitle: 'Dans l’ordre',
    milestonesLede: 'Le premier est le prochain. Chaque titre ouvre le jalon sur GitHub, qui réunit les mêmes issues.',
    position: (n) => `Jalon ${n}`,
    issues: (n) => (n === 1 ? '1 issue' : `${n} issues`),
    noIssues: 'Pas encore d’issues',
    openMilestone: 'Ouvrir le jalon sur GitHub',
    titlesNote: 'Une issue montre son titre quand le tableau du travail ouvert du dépôt l’a, et son numéro sinon.',
    considerationTitle: 'À l’étude',
    considerationLede: 'Non planifié, et consigné pour que le raisonnement reste au dossier.',
    considerationMissing: 'La feuille de route n’a pas cette section pour le moment.',
    viewOnGitHub: 'Voir sur GitHub',
  },
  de: {
    metaTitle: 'Roadmap',
    metaDescription: 'Die Meilensteine in der Reihenfolge, auf die sich das Projekt festlegt, jeder mit seinen Issues, und was erwogen und nicht geplant ist. Keine Termine: Die Reihenfolge ist die Zusage.',
    title: 'Roadmap',
    lede: 'Wohin das Projekt geht, der Reihe nach, mit der Arbeit, die zu jedem Schritt gehört. Was nicht geplant ist, steht mit seiner Begründung da.',
    englishNote: 'Die Roadmap ist englisch. Nur die Navigation drumherum ist übersetzt.',
    noDates: 'Diese Seite trägt absichtlich keine Termine. Die Reihenfolge ist die Zusage, der Kalender nicht.',
    milestonesTitle: 'Der Reihe nach',
    milestonesLede: 'Der erste ist der nächste. Jeder Titel öffnet den Meilenstein auf GitHub, der dieselben Issues enthält.',
    position: (n) => `Meilenstein ${n}`,
    issues: (n) => (n === 1 ? '1 Issue' : `${n} Issues`),
    noIssues: 'Noch keine Issues',
    openMilestone: 'Meilenstein auf GitHub öffnen',
    titlesNote: 'Ein Issue zeigt seinen Titel, wenn ihn die Tabelle der offenen Arbeit des Repositorys hat, sonst seine Nummer.',
    considerationTitle: 'In Erwägung',
    considerationLede: 'Nicht geplant und aufgeschrieben, damit die Begründung festgehalten ist.',
    considerationMissing: 'Die Roadmap hat zurzeit keinen solchen Abschnitt.',
    viewOnGitHub: 'Auf GitHub ansehen',
  },
  pt: {
    metaTitle: 'Roteiro',
    metaDescription: 'Os marcos na ordem a que o projeto se compromete, cada um com as suas issues, e o que está em consideração sem data. Sem datas: a ordem é o compromisso.',
    title: 'Roteiro',
    lede: 'Para onde vai o projeto, por ordem, com o trabalho que pertence a cada passo. O que não está agendado fica escrito com o seu raciocínio.',
    englishNote: 'O roteiro está em inglês. Só a navegação à volta é traduzida.',
    noDates: 'Esta página não tem datas, de propósito. A ordem é o compromisso e o calendário não.',
    milestonesTitle: 'Por ordem',
    milestonesLede: 'O primeiro é o seguinte. Cada título abre o marco no GitHub, que reúne as mesmas issues.',
    position: (n) => `Marco ${n}`,
    issues: (n) => (n === 1 ? '1 issue' : `${n} issues`),
    noIssues: 'Ainda sem issues',
    openMilestone: 'Abrir o marco no GitHub',
    titlesNote: 'Uma issue mostra o título quando a tabela de trabalho aberto do repositório o tem, e o número caso contrário.',
    considerationTitle: 'Em consideração',
    considerationLede: 'Não agendado, e escrito para que o raciocínio fique registado.',
    considerationMissing: 'De momento o roteiro não tem essa secção.',
    viewOnGitHub: 'Ver no GitHub',
  },
};

export const CHANGELOG_COPY: Record<MarketingLocale, ChangelogCopy> = {
  en: {
    metaTitle: 'Changelog',
    metaDescription: 'What changed in every release of Trazum, newest first, one anchor per release, with what is merged and not yet released at the top.',
    title: 'Changelog',
    lede: 'What changed, release by release, newest first. Each release has an address of its own.',
    englishNote: 'The changelog is in English. Only the navigation around it is translated.',
    unreleased: 'Unreleased',
    unreleasedLede: 'Merged into main and not yet tagged. These are not in any release you can install.',
    allReleases: 'Every release',
    count: (n) => (n === 1 ? '1 release' : `${n} releases`),
    drawnBelow: (n) => `The ${n} newest releases are drawn in full below. Every release has its own page.`,
    ownPage: 'Its own page',
    inFull: 'Drawn below',
    readRelease: 'Read this release',
    dateOf: (date) => `Released ${date}`,
    notDated: 'No date in the file',
    newer: 'Newer',
    older: 'Older',
    allReleasesLink: 'All releases',
    viewOnGitHub: 'View on GitHub',
    breadcrumb: 'Changelog',
    onThisPage: 'On this page',
    releasePageTitle: (version) => `Trazum ${version}`,
  },
  es: {
    metaTitle: 'Cambios',
    metaDescription: 'Qué cambió en cada versión de Trazum, de la más reciente a la más antigua, con un ancla por versión y lo ya integrado sin publicar arriba.',
    title: 'Registro de cambios',
    lede: 'Qué cambió, versión a versión, de la más reciente a la más antigua. Cada versión tiene su propia dirección.',
    englishNote: 'El registro de cambios está en inglés. Solo se traduce la navegación que lo rodea.',
    unreleased: 'Sin publicar',
    unreleasedLede: 'Integrado en main y aún sin etiqueta. No está en ninguna versión que se pueda instalar.',
    allReleases: 'Todas las versiones',
    count: (n) => (n === 1 ? '1 versión' : `${n} versiones`),
    drawnBelow: (n) => `Las ${n} versiones más recientes se muestran enteras debajo. Cada versión tiene su propia página.`,
    ownPage: 'Su propia página',
    inFull: 'Debajo',
    readRelease: 'Leer esta versión',
    dateOf: (date) => `Publicada el ${date}`,
    notDated: 'Sin fecha en el archivo',
    newer: 'Más reciente',
    older: 'Más antigua',
    allReleasesLink: 'Todas las versiones',
    viewOnGitHub: 'Ver en GitHub',
    breadcrumb: 'Cambios',
    onThisPage: 'En esta página',
    releasePageTitle: (version) => `Trazum ${version}`,
  },
  fr: {
    metaTitle: 'Journal des modifications',
    metaDescription: 'Ce qui a changé dans chaque version de Trazum, de la plus récente à la plus ancienne, avec une ancre par version et ce qui est intégré sans être publié en tête.',
    title: 'Journal des modifications',
    lede: 'Ce qui a changé, version par version, de la plus récente à la plus ancienne. Chaque version a son adresse.',
    englishNote: 'Le journal est en anglais. Seule la navigation autour est traduite.',
    unreleased: 'Non publié',
    unreleasedLede: 'Intégré dans main et pas encore étiqueté. Rien de cela n’est dans une version installable.',
    allReleases: 'Toutes les versions',
    count: (n) => (n === 1 ? '1 version' : `${n} versions`),
    drawnBelow: (n) => `Les ${n} versions les plus récentes sont affichées en entier ci-dessous. Chaque version a sa propre page.`,
    ownPage: 'Sa propre page',
    inFull: 'Ci-dessous',
    readRelease: 'Lire cette version',
    dateOf: (date) => `Publiée le ${date}`,
    notDated: 'Pas de date dans le fichier',
    newer: 'Plus récente',
    older: 'Plus ancienne',
    allReleasesLink: 'Toutes les versions',
    viewOnGitHub: 'Voir sur GitHub',
    breadcrumb: 'Journal',
    onThisPage: 'Sur cette page',
    releasePageTitle: (version) => `Trazum ${version}`,
  },
  de: {
    metaTitle: 'Änderungsprotokoll',
    metaDescription: 'Was sich in jeder Version von Trazum geändert hat, neueste zuerst, ein Anker je Version, mit dem Integrierten und noch nicht Veröffentlichten oben.',
    title: 'Änderungsprotokoll',
    lede: 'Was sich geändert hat, Version für Version, neueste zuerst. Jede Version hat eine eigene Adresse.',
    englishNote: 'Das Änderungsprotokoll ist englisch. Nur die Navigation drumherum ist übersetzt.',
    unreleased: 'Unveröffentlicht',
    unreleasedLede: 'In main integriert und noch nicht getaggt. Nichts davon steckt in einer installierbaren Version.',
    allReleases: 'Alle Versionen',
    count: (n) => (n === 1 ? '1 Version' : `${n} Versionen`),
    drawnBelow: (n) => `Die ${n} neuesten Versionen stehen unten vollständig. Jede Version hat eine eigene Seite.`,
    ownPage: 'Eigene Seite',
    inFull: 'Unten',
    readRelease: 'Diese Version lesen',
    dateOf: (date) => `Veröffentlicht am ${date}`,
    notDated: 'Kein Datum in der Datei',
    newer: 'Neuer',
    older: 'Älter',
    allReleasesLink: 'Alle Versionen',
    viewOnGitHub: 'Auf GitHub ansehen',
    breadcrumb: 'Protokoll',
    onThisPage: 'Auf dieser Seite',
    releasePageTitle: (version) => `Trazum ${version}`,
  },
  pt: {
    metaTitle: 'Registo de alterações',
    metaDescription: 'O que mudou em cada versão do Trazum, da mais recente à mais antiga, com uma âncora por versão e o que está integrado e ainda não publicado no topo.',
    title: 'Registo de alterações',
    lede: 'O que mudou, versão a versão, da mais recente à mais antiga. Cada versão tem o seu endereço.',
    englishNote: 'O registo está em inglês. Só a navegação à volta é traduzida.',
    unreleased: 'Por publicar',
    unreleasedLede: 'Integrado no main e ainda sem etiqueta. Nada disto está numa versão instalável.',
    allReleases: 'Todas as versões',
    count: (n) => (n === 1 ? '1 versão' : `${n} versões`),
    drawnBelow: (n) => `As ${n} versões mais recentes aparecem completas abaixo. Cada versão tem a sua página.`,
    ownPage: 'Página própria',
    inFull: 'Abaixo',
    readRelease: 'Ler esta versão',
    dateOf: (date) => `Publicada em ${date}`,
    notDated: 'Sem data no ficheiro',
    newer: 'Mais recente',
    older: 'Mais antiga',
    allReleasesLink: 'Todas as versões',
    viewOnGitHub: 'Ver no GitHub',
    breadcrumb: 'Registo',
    onThisPage: 'Nesta página',
    releasePageTitle: (version) => `Trazum ${version}`,
  },
};

/** One sentence for each page, where another page of the site points at it. */
export const PAGE_BLURBS: Record<MarketingLocale, { models: string; roadmap: string; changelog: string; alsoTitle: string; alsoLede: string }> = {
  en: {
    models: 'Every model the catalogue prices, with its rates and the date each provider’s page was last read.',
    roadmap: 'The milestones in order, each with its issues, and what is not scheduled.',
    changelog: 'What changed in every release, newest first.',
    alsoTitle: 'Also on the site',
    alsoLede: 'Three questions asked before trusting a tool that prints a bill, answered from the repository’s own files.',
  },
  es: {
    models: 'Cada modelo que tarifica el catálogo, con sus precios y la fecha en que se leyó por última vez la página de cada proveedor.',
    roadmap: 'Los hitos en orden, cada uno con sus issues, y lo que no está programado.',
    changelog: 'Qué cambió en cada versión, de la más reciente a la más antigua.',
    alsoTitle: 'También en el sitio',
    alsoLede: 'Tres preguntas que se hacen antes de fiarse de una herramienta que imprime una factura, respondidas con los archivos del propio repositorio.',
  },
  fr: {
    models: 'Chaque modèle que tarife le catalogue, avec ses tarifs et la date de dernière lecture de la page de chaque fournisseur.',
    roadmap: 'Les jalons dans l’ordre, chacun avec ses issues, et ce qui n’est pas planifié.',
    changelog: 'Ce qui a changé dans chaque version, de la plus récente à la plus ancienne.',
    alsoTitle: 'Aussi sur le site',
    alsoLede: 'Trois questions qu’on pose avant de se fier à un outil qui imprime une facture, avec des réponses tirées des fichiers du dépôt.',
  },
  de: {
    models: 'Jedes Modell, das der Katalog bepreist, mit seinen Preisen und dem Datum, an dem die Seite jedes Anbieters zuletzt gelesen wurde.',
    roadmap: 'Die Meilensteine der Reihe nach, jeder mit seinen Issues, und was nicht geplant ist.',
    changelog: 'Was sich in jeder Version geändert hat, neueste zuerst.',
    alsoTitle: 'Auch auf der Website',
    alsoLede: 'Drei Fragen, die man stellt, bevor man einem Werkzeug traut, das eine Rechnung druckt, beantwortet aus den Dateien des Repositorys.',
  },
  pt: {
    models: 'Cada modelo que o catálogo tarifa, com os seus preços e a data em que a página de cada fornecedor foi lida pela última vez.',
    roadmap: 'Os marcos por ordem, cada um com as suas issues, e o que não está agendado.',
    changelog: 'O que mudou em cada versão, da mais recente à mais antiga.',
    alsoTitle: 'Também no site',
    alsoLede: 'Três perguntas que se fazem antes de confiar numa ferramenta que imprime uma fatura, respondidas com os ficheiros do próprio repositório.',
  },
};
