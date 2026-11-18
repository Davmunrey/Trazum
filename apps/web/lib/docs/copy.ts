import type { MarketingLocale } from '../marketing-locales';
import type { DocGroup, KeptId } from './manifest';

/**
 * The words around the documents: the index's headings, the search field,
 * the contents list, the links at the foot of a page.
 *
 * In the five languages the public site speaks, and nothing else. The
 * documents themselves are in English in every language, because the
 * repository is English and a translation would be a second copy that
 * drifts; the page says so in the reader's language (`englishNote`). The
 * type is the parity check the compiler runs, `docs.test.mjs` checks that
 * each string is there and not empty, and French, German and Portuguese are
 * machine-drafted and unreviewed, as the banner the site shows in them says.
 */
export interface DocsCopy {
  indexTitle: string;
  indexLede: string;
  /** Said on every documentation page when the site is not in English. */
  englishNote: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchResults: (count: number) => string;
  searchNone: string;
  /** What a result that is a whole document, not a heading in one, is called. */
  searchDocument: string;
  searchUnavailable: string;
  tasksTitle: string;
  groups: Record<DocGroup, { title: string; lede: string }>;
  breadcrumb: string;
  onThisPage: string;
  allDocuments: string;
  viewOnGitHub: string;
  previous: string;
  next: string;
  keptTitle: string;
  keptLede: string;
  kept: Record<KeptId, string>;
  keptBrowse: string;
}

export const DOCS_COPY: Record<MarketingLocale, DocsCopy> = {
  en: {
    indexTitle: 'Documentation',
    indexLede: 'The documents of the repository, readable here. Start with a task, or search the headings.',
    englishNote: 'The documents are in English. Only the navigation around them is translated.',
    searchLabel: 'Search the documentation',
    searchPlaceholder: 'Search the docs',
    searchResults: (count) => (count === 1 ? '1 result' : `${count} results`),
    searchNone: 'Nothing matches. Try a command name or a shorter word.',
    searchDocument: 'Document',
    searchUnavailable: 'Search could not load. The list of documents still works.',
    tasksTitle: 'Start with a task',
    groups: {
      start: { title: 'Start here', lede: 'A first result in minutes, and the setup behind it.' },
      use: { title: 'Using Trazum', lede: 'Commands, formats and integrations, in the order you meet them.' },
      decide: {
        title: 'Deciding whether to use it',
        lede: 'Why the numbers deserve trust, and what the project says about itself.',
      },
      extend: { title: 'Extending it', lede: 'Writing a rule, a dictionary or a change.' },
      maintain: { title: 'Maintaining it', lede: 'Direction, versions and releases.' },
    },
    breadcrumb: 'Documentation',
    onThisPage: 'On this page',
    allDocuments: 'All documents',
    viewOnGitHub: 'View on GitHub',
    previous: 'Previous',
    next: 'Next',
    keptTitle: 'Kept in the repository',
    keptLede: 'These are records, not instructions. They stay on GitHub, and nothing on this site rewrites them.',
    kept: {
      plans: 'Historical plans',
      compliance: 'Compliance records',
      audit: 'Audit',
      cla: 'The CLA',
      security: 'Security policy',
      support: 'Support',
      conduct: 'Code of conduct',
      releases: 'Releases',
    },
    keptBrowse: 'Browse docs/ on GitHub',
  },
  es: {
    indexTitle: 'Documentación',
    indexLede: 'Los documentos del repositorio, para leer aquí. Empieza por una tarea o busca entre los títulos.',
    englishNote: 'Los documentos están en inglés. Solo se traduce la navegación que los rodea.',
    searchLabel: 'Buscar en la documentación',
    searchPlaceholder: 'Buscar en los docs',
    searchResults: (count) => (count === 1 ? '1 resultado' : `${count} resultados`),
    searchNone: 'Nada coincide. Prueba con el nombre de un comando o una palabra más corta.',
    searchDocument: 'Documento',
    searchUnavailable: 'No se pudo cargar la búsqueda. La lista de documentos sigue funcionando.',
    tasksTitle: 'Empieza por una tarea',
    groups: {
      start: { title: 'Para empezar', lede: 'Un primer resultado en minutos y la instalación que hay detrás.' },
      use: { title: 'Usar Trazum', lede: 'Comandos, formatos e integraciones, en el orden en que se encuentran.' },
      decide: {
        title: 'Decidir si usarlo',
        lede: 'Por qué merecen confianza las cifras y qué dice el proyecto de sí mismo.',
      },
      extend: { title: 'Ampliarlo', lede: 'Escribir una regla, un diccionario o un cambio.' },
      maintain: { title: 'Mantenerlo', lede: 'Dirección, versiones y publicaciones.' },
    },
    breadcrumb: 'Documentación',
    onThisPage: 'En esta página',
    allDocuments: 'Todos los documentos',
    viewOnGitHub: 'Ver en GitHub',
    previous: 'Anterior',
    next: 'Siguiente',
    keptTitle: 'Se quedan en el repositorio',
    keptLede: 'Son registros, no instrucciones. Siguen en GitHub y nada en este sitio los reescribe.',
    kept: {
      plans: 'Planes históricos',
      compliance: 'Registros de cumplimiento',
      audit: 'Auditoría',
      cla: 'El CLA',
      security: 'Política de seguridad',
      support: 'Soporte',
      conduct: 'Código de conducta',
      releases: 'Versiones publicadas',
    },
    keptBrowse: 'Ver docs/ en GitHub',
  },
  fr: {
    indexTitle: 'Documentation',
    indexLede: 'Les documents du dépôt, lisibles ici. Partez d’une tâche, ou cherchez dans les titres.',
    englishNote: 'Les documents sont en anglais. Seule la navigation autour d’eux est traduite.',
    searchLabel: 'Rechercher dans la documentation',
    searchPlaceholder: 'Rechercher',
    searchResults: (count) => (count === 1 ? '1 résultat' : `${count} résultats`),
    searchNone: 'Aucun résultat. Essayez le nom d’une commande ou un mot plus court.',
    searchDocument: 'Document',
    searchUnavailable: 'La recherche n’a pas pu se charger. La liste des documents fonctionne toujours.',
    tasksTitle: 'Partir d’une tâche',
    groups: {
      start: { title: 'Pour commencer', lede: 'Un premier résultat en quelques minutes, et l’installation qui le sous-tend.' },
      use: { title: 'Utiliser Trazum', lede: 'Commandes, formats et intégrations, dans l’ordre où on les rencontre.' },
      decide: {
        title: 'Décider de l’utiliser',
        lede: 'Pourquoi les chiffres méritent confiance, et ce que le projet dit de lui-même.',
      },
      extend: { title: 'L’étendre', lede: 'Écrire une règle, un dictionnaire ou un changement.' },
      maintain: { title: 'Le maintenir', lede: 'Orientation, versions et publications.' },
    },
    breadcrumb: 'Documentation',
    onThisPage: 'Sur cette page',
    allDocuments: 'Tous les documents',
    viewOnGitHub: 'Voir sur GitHub',
    previous: 'Précédent',
    next: 'Suivant',
    keptTitle: 'Conservés dans le dépôt',
    keptLede: 'Ce sont des archives, pas des instructions. Elles restent sur GitHub et rien sur ce site ne les réécrit.',
    kept: {
      plans: 'Plans historiques',
      compliance: 'Dossiers de conformité',
      audit: 'Audit',
      cla: 'Le CLA',
      security: 'Politique de sécurité',
      support: 'Assistance',
      conduct: 'Code de conduite',
      releases: 'Versions publiées',
    },
    keptBrowse: 'Parcourir docs/ sur GitHub',
  },
  de: {
    indexTitle: 'Dokumentation',
    indexLede: 'Die Dokumente des Repositorys, hier lesbar. Beginnen Sie mit einer Aufgabe oder suchen Sie in den Überschriften.',
    englishNote: 'Die Dokumente sind auf Englisch. Übersetzt ist nur die Navigation um sie herum.',
    searchLabel: 'Dokumentation durchsuchen',
    searchPlaceholder: 'Suchen',
    searchResults: (count) => (count === 1 ? '1 Treffer' : `${count} Treffer`),
    searchNone: 'Keine Treffer. Versuchen Sie einen Befehlsnamen oder ein kürzeres Wort.',
    searchDocument: 'Dokument',
    searchUnavailable: 'Die Suche konnte nicht geladen werden. Die Dokumentliste funktioniert weiterhin.',
    tasksTitle: 'Mit einer Aufgabe beginnen',
    groups: {
      start: { title: 'Erste Schritte', lede: 'Ein erstes Ergebnis in Minuten und die Einrichtung dahinter.' },
      use: { title: 'Trazum benutzen', lede: 'Befehle, Formate und Integrationen, in der Reihenfolge, in der man ihnen begegnet.' },
      decide: {
        title: 'Entscheiden, ob es passt',
        lede: 'Warum die Zahlen Vertrauen verdienen und was das Projekt über sich selbst sagt.',
      },
      extend: { title: 'Erweitern', lede: 'Eine Regel, ein Wörterbuch oder eine Änderung schreiben.' },
      maintain: { title: 'Pflegen', lede: 'Richtung, Versionen und Veröffentlichungen.' },
    },
    breadcrumb: 'Dokumentation',
    onThisPage: 'Auf dieser Seite',
    allDocuments: 'Alle Dokumente',
    viewOnGitHub: 'Auf GitHub ansehen',
    previous: 'Zurück',
    next: 'Weiter',
    keptTitle: 'Im Repository aufbewahrt',
    keptLede: 'Das sind Aufzeichnungen, keine Anleitungen. Sie bleiben auf GitHub, und nichts auf dieser Seite schreibt sie um.',
    kept: {
      plans: 'Historische Pläne',
      compliance: 'Compliance-Unterlagen',
      audit: 'Audit',
      cla: 'Das CLA',
      security: 'Sicherheitsrichtlinie',
      support: 'Support',
      conduct: 'Verhaltenskodex',
      releases: 'Veröffentlichte Versionen',
    },
    keptBrowse: 'docs/ auf GitHub durchsuchen',
  },
  pt: {
    indexTitle: 'Documentação',
    indexLede: 'Os documentos do repositório, para ler aqui. Comece por uma tarefa ou procure nos títulos.',
    englishNote: 'Os documentos estão em inglês. Só a navegação à volta deles está traduzida.',
    searchLabel: 'Pesquisar na documentação',
    searchPlaceholder: 'Pesquisar',
    searchResults: (count) => (count === 1 ? '1 resultado' : `${count} resultados`),
    searchNone: 'Nada corresponde. Experimente o nome de um comando ou uma palavra mais curta.',
    searchDocument: 'Documento',
    searchUnavailable: 'Não foi possível carregar a pesquisa. A lista de documentos continua a funcionar.',
    tasksTitle: 'Comece por uma tarefa',
    groups: {
      start: { title: 'Para começar', lede: 'Um primeiro resultado em minutos e a instalação por trás dele.' },
      use: { title: 'Usar o Trazum', lede: 'Comandos, formatos e integrações, pela ordem em que se encontram.' },
      decide: {
        title: 'Decidir se o usa',
        lede: 'Porque é que os números merecem confiança e o que o projeto diz de si próprio.',
      },
      extend: { title: 'Estendê-lo', lede: 'Escrever uma regra, um dicionário ou uma alteração.' },
      maintain: { title: 'Mantê-lo', lede: 'Direção, versões e publicações.' },
    },
    breadcrumb: 'Documentação',
    onThisPage: 'Nesta página',
    allDocuments: 'Todos os documentos',
    viewOnGitHub: 'Ver no GitHub',
    previous: 'Anterior',
    next: 'Seguinte',
    keptTitle: 'Guardados no repositório',
    keptLede: 'São registos, não instruções. Ficam no GitHub e nada neste site os reescreve.',
    kept: {
      plans: 'Planos históricos',
      compliance: 'Registos de conformidade',
      audit: 'Auditoria',
      cla: 'O CLA',
      security: 'Política de segurança',
      support: 'Suporte',
      conduct: 'Código de conduta',
      releases: 'Versões publicadas',
    },
    keptBrowse: 'Ver docs/ no GitHub',
  },
};
