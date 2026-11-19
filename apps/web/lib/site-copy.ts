import type { MarketingLocale } from './marketing-locales';
import type { FooterGroupId, SiteLinkId } from './site';

/**
 * The words of the site shell: the header, the phone menu, the footer, the
 * copy control and the page that answers an address nothing lives at.
 *
 * In the five languages the public site speaks. The type is the parity check
 * the compiler runs: a key missing from one language, or a link id added to
 * `site.ts` with no label here, is a build error, and `site.test.mjs` checks
 * that each string is there and not empty.
 *
 * French, German and Portuguese are machine-drafted and unreviewed, as the
 * landing says on the page in those languages.
 */
export interface SiteCopy {
  skipToContent: string;
  /** The wordmark is a link home; this is what a screen reader hears. */
  home: string;
  /** The header's navigation landmark. */
  nav: string;
  links: Record<SiteLinkId, string>;
  /** The primary action on every public page. */
  dashboardCta: string;
  /** Added to the name of a link that opens in a new tab. */
  opensExternal: string;
  menuOpen: string;
  menuClose: string;
  language: string;
  appearance: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  footerGroups: Record<FooterGroupId, string>;
  footerLine: string;
  copyCommand: string;
  copied: string;
  /** The tab's title on the page that answers an address nothing lives at. */
  notFoundMetaTitle: string;
  notFoundTitle: string;
  notFoundBody: string;
  notFoundHome: string;
}

/**
 * Shown under the header on the machine-drafted languages, on every page of
 * the site: unreviewed, and saying so, with an invitation to a native speaker
 * rather than a claim of authority. The same honesty the trimming
 * dictionaries carry. Empty where a person reviewed the words.
 */
export const UNREVIEWED_NOTE: Record<MarketingLocale, string> = {
  en: '',
  es: '',
  fr: 'Traduction automatique, non relue par un locuteur natif. Une correction ? Ouvrez une issue sur GitHub.',
  de: 'Maschinell übersetzt, nicht von Muttersprachlern geprüft. Fehler gefunden? Eröffnen Sie ein GitHub-Issue.',
  pt: 'Tradução automática, sem revisão de falante nativo. Encontrou um erro? Abra uma issue no GitHub.',
};

export const SITE_COPY: Record<MarketingLocale, SiteCopy> = {
  en: {
    skipToContent: 'Skip to content',
    home: 'Trazum, home',
    nav: 'Site',
    links: {
      dashboard: 'Dashboard',
      playground: 'Playground',
      docs: 'Docs',
      models: 'Models',
      pro: 'Pro',
      roadmap: 'Roadmap',
      github: 'GitHub',
      npm: 'npm package',
      changelog: 'Changelog',
      brand: 'Brand',
      security: 'Security policy',
      licence: 'Licence (MIT)',
    },
    dashboardCta: 'Open the dashboard',
    opensExternal: 'opens in a new tab',
    menuOpen: 'Menu',
    menuClose: 'Close menu',
    language: 'Language',
    appearance: 'Appearance',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    footerGroups: { product: 'Product', project: 'Project' },
    footerLine: 'Open source under the MIT licence. Local analysis, no provider key needed to get started.',
    copyCommand: 'Copy the command',
    copied: 'Copied',
    notFoundMetaTitle: 'Page not found',
    notFoundTitle: 'Nothing lives at this address.',
    notFoundBody: 'The link may be old, or mistyped. The application moved to /app, and every page of the site is one click from the header.',
    notFoundHome: 'Back to the home page',
  },
  es: {
    skipToContent: 'Saltar al contenido',
    home: 'Trazum, inicio',
    nav: 'Sitio',
    links: {
      dashboard: 'Panel',
      playground: 'Playground',
      docs: 'Documentación',
      models: 'Modelos',
      pro: 'Pro',
      roadmap: 'Hoja de ruta',
      github: 'GitHub',
      npm: 'Paquete npm',
      changelog: 'Cambios',
      brand: 'Marca',
      security: 'Política de seguridad',
      licence: 'Licencia (MIT)',
    },
    dashboardCta: 'Abrir el panel',
    opensExternal: 'se abre en una pestaña nueva',
    menuOpen: 'Menú',
    menuClose: 'Cerrar el menú',
    language: 'Idioma',
    appearance: 'Apariencia',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    themeSystem: 'Sistema',
    footerGroups: { product: 'Producto', project: 'Proyecto' },
    footerLine: 'Código abierto con licencia MIT. Análisis local, sin clave de proveedor para empezar.',
    copyCommand: 'Copiar el comando',
    copied: 'Copiado',
    notFoundMetaTitle: 'Página no encontrada',
    notFoundTitle: 'En esta dirección no hay nada.',
    notFoundBody: 'Puede que el enlace sea antiguo o tenga una errata. La aplicación se ha movido a /app, y cada página del sitio está a un clic desde la cabecera.',
    notFoundHome: 'Volver al inicio',
  },
  fr: {
    skipToContent: 'Aller au contenu',
    home: 'Trazum, accueil',
    nav: 'Site',
    links: {
      dashboard: 'Tableau de bord',
      playground: 'Playground',
      docs: 'Documentation',
      models: 'Modèles',
      pro: 'Pro',
      roadmap: 'Feuille de route',
      github: 'GitHub',
      npm: 'Paquet npm',
      changelog: 'Journal des modifications',
      brand: 'Marque',
      security: 'Politique de sécurité',
      licence: 'Licence (MIT)',
    },
    dashboardCta: 'Ouvrir le tableau de bord',
    opensExternal: 's’ouvre dans un nouvel onglet',
    menuOpen: 'Menu',
    menuClose: 'Fermer le menu',
    language: 'Langue',
    appearance: 'Apparence',
    themeLight: 'Clair',
    themeDark: 'Sombre',
    themeSystem: 'Système',
    footerGroups: { product: 'Produit', project: 'Projet' },
    footerLine: 'Open source sous licence MIT. Analyse locale, aucune clé de fournisseur pour commencer.',
    copyCommand: 'Copier la commande',
    copied: 'Copié',
    notFoundMetaTitle: 'Page introuvable',
    notFoundTitle: 'Rien n’existe à cette adresse.',
    notFoundBody: 'Le lien est peut-être ancien, ou mal saisi. L’application a déménagé à /app, et chaque page du site est à un clic depuis l’en-tête.',
    notFoundHome: 'Retour à l’accueil',
  },
  de: {
    skipToContent: 'Zum Inhalt springen',
    home: 'Trazum, Startseite',
    nav: 'Website',
    links: {
      dashboard: 'Dashboard',
      playground: 'Playground',
      docs: 'Dokumentation',
      models: 'Modelle',
      pro: 'Pro',
      roadmap: 'Roadmap',
      github: 'GitHub',
      npm: 'npm-Paket',
      changelog: 'Änderungsprotokoll',
      brand: 'Marke',
      security: 'Sicherheitsrichtlinie',
      licence: 'Lizenz (MIT)',
    },
    dashboardCta: 'Dashboard öffnen',
    opensExternal: 'öffnet sich in einem neuen Tab',
    menuOpen: 'Menü',
    menuClose: 'Menü schließen',
    language: 'Sprache',
    appearance: 'Darstellung',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    themeSystem: 'System',
    footerGroups: { product: 'Produkt', project: 'Projekt' },
    footerLine: 'Open Source unter der MIT-Lizenz. Lokale Analyse, kein Anbieterschlüssel für den Einstieg nötig.',
    copyCommand: 'Befehl kopieren',
    copied: 'Kopiert',
    notFoundMetaTitle: 'Seite nicht gefunden',
    notFoundTitle: 'Unter dieser Adresse gibt es nichts.',
    notFoundBody: 'Der Link ist vielleicht alt oder vertippt. Die Anwendung ist nach /app umgezogen, und jede Seite der Website ist einen Klick von der Kopfzeile entfernt.',
    notFoundHome: 'Zur Startseite',
  },
  pt: {
    skipToContent: 'Saltar para o conteúdo',
    home: 'Trazum, início',
    nav: 'Site',
    links: {
      dashboard: 'Painel',
      playground: 'Playground',
      docs: 'Documentação',
      models: 'Modelos',
      pro: 'Pro',
      roadmap: 'Roteiro',
      github: 'GitHub',
      npm: 'Pacote npm',
      changelog: 'Alterações',
      brand: 'Marca',
      security: 'Política de segurança',
      licence: 'Licença (MIT)',
    },
    dashboardCta: 'Abrir o painel',
    opensExternal: 'abre num novo separador',
    menuOpen: 'Menu',
    menuClose: 'Fechar o menu',
    language: 'Idioma',
    appearance: 'Aparência',
    themeLight: 'Claro',
    themeDark: 'Escuro',
    themeSystem: 'Sistema',
    footerGroups: { product: 'Produto', project: 'Projeto' },
    footerLine: 'Código aberto com licença MIT. Análise local, sem chave de fornecedor para começar.',
    copyCommand: 'Copiar o comando',
    copied: 'Copiado',
    notFoundMetaTitle: 'Página não encontrada',
    notFoundTitle: 'Não existe nada neste endereço.',
    notFoundBody: 'O link pode ser antigo, ou ter um erro. A aplicação mudou-se para /app, e cada página do site está a um clique a partir do cabeçalho.',
    notFoundHome: 'Voltar ao início',
  },
};
