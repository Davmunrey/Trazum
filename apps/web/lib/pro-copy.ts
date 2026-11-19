import type { MarketingLocale } from './marketing-locales';

/**
 * The words of `/pro`, in the five languages the public site speaks.
 *
 * Every sentence here says what Trazum Pro's own repository says of it (its
 * README, the four rules and the ceiling of its ROADMAP.md, its
 * `docs/pricing.md`) or what this repository says of itself
 * (`docs/licensing.md`, the receipt and the test that holds it). No figure is
 * written in these words: the prices, ceilings and shares come from
 * `lib/pro.ts`, formatted by the page, and the figures the sentences take are
 * passed in. `pro-page.test.mjs` checks the keys match in every language, that
 * none is empty and that none has an em-dash.
 *
 * French, German and Portuguese are machine-drafted and unreviewed, as the
 * banner the site shows in them says.
 */
export interface ProCopy {
  metaTitle: string;
  metaDescription: string;
  /** The line above the title, and the page's status in four words. */
  status: string;
  title: string;
  lede: string;
  answersTitle: string;
  answersLede: string;
  answers: readonly { readonly question: string; readonly answer: string }[];
  propertyTitle: string;
  propertyBody: string;
  propertyEmitter: string;
  propertyTest: string;
  propertyLabel: string;
  propertyRule: string;
  receiptDocs: string;
  receiptTest: string;
  splitTitle: string;
  splitLede: string;
  openTitle: string;
  openItems: readonly string[];
  proTitle: string;
  proItems: readonly string[];
  promise: string;
  licensingLink: string;
  tiersTitle: string;
  tiersLede: string;
  tableCaption: string;
  columns: { tier: string; price: string; spend: string; share: string };
  perMonth: (amount: string) => string;
  byAgreement: string;
  upTo: (amount: string) => string;
  above: (amount: string) => string;
  breakEven: (tier: string, share: string) => string;
  freeLine: (members: number) => string;
  decided: string;
  notOpenTitle: string;
  notOpen: string;
  cta: string;
  ctaNote: (address: string) => string;
  watch: string;
}

export const PRO_COPY: Record<MarketingLocale, ProCopy> = {
  en: {
    metaTitle: 'Trazum Pro',
    metaDescription:
      'Trazum Pro, in development and not open yet: where an organisation’s model spend went, whether it is inside its budget, what changed when it moved. No prompt text reaches its server.',
    status: 'In development. Not open yet.',
    title: 'Trazum Pro',
    lede: 'The open tool answers for a person, on their own files. Pro answers for an organisation, from the receipts every machine in it files.',
    answersTitle: 'What it answers',
    answersLede: 'Four questions, for an organisation rather than a person. Pro stops there: it does not become a proxy, a gateway or a monitoring platform.',
    answers: [
      {
        question: 'Where the model spend went',
        answer: 'By project, by model and by provider, over a period, from every machine that files a receipt.',
      },
      {
        question: 'Whether it is inside its budget',
        answer: 'Ceilings on the organisation or on one project, with what is consumed, the burn and the projection, and an alert before the invoice rather than after it.',
      },
      {
        question: 'What changed when it moved',
        answer: 'Why the bill moved: volume, size, unit cost and the interaction that belongs to none of them, four terms that add back to the change exactly.',
      },
      {
        question: 'A figure an auditor can trace',
        answer: 'Every figure says which rate produced it and when that rate was last reviewed. A number nobody can audit is what Pro exists to replace.',
      },
    ],
    propertyTitle: 'No prompt text reaches this server.',
    propertyBody:
      'Not redacted, not hashed, not truncated on arrival. The analysis already ran on the machine that made the call, a laptop or a CI runner, and what travels is a receipt: token counts, the model, the rate applied, the date that rate was last reviewed, the attribution label, the period, and what could not be priced.',
    propertyEmitter: 'The receipt is made by `trazum receipt`, with `receiptFrom` from `@trazum/core`: MIT, in this repository, readable by anybody without asking for anything.',
    propertyTest: 'A test plants prompt text, a file path, a branch name and a credential in a log, and fails if any of them reaches the receipt.',
    propertyLabel: 'One field is yours to write: the label. It travels as you wrote it, so name it after a project and not after a prompt.',
    propertyRule: 'A capability that would need the prompt does not get built.',
    receiptDocs: 'How a receipt is made',
    receiptTest: 'Read the test on GitHub',
    splitTitle: 'Free forever, and what Pro adds',
    splitLede:
      'Anything one person can compute from their own files on their own machine is free, forever, in the open tool. Pro adds what nobody has alone: aggregation and memory across a team.',
    openTitle: 'The open tool, MIT',
    openItems: [
      'Every analysis this repository performs: the bill, the gates, the optimiser, the pricing, the converters and the report documents',
      'On your own machine, with no account and no provider key to begin',
      'The receipt Pro reads, and the code that makes it',
    ],
    proTitle: 'Trazum Pro',
    proItems: ['Budgets and alerts across a team', 'Chargeback to cost centres', 'Reports that arrive on their own', 'An audit log of who changed what', 'Single sign-on'],
    promise:
      'No analysis moves out of the open set to make a feature of Pro. If Pro needs an analysis that does not exist, it is written here, in the open, first. Pro is proprietary and developed separately, and that relicenses nothing in this repository.',
    licensingLink: 'What is open, what is not, and what cannot move',
    tiersTitle: 'The tiers',
    tiersLede:
      'A flat price for the organisation, by the model spend it manages in a month, not by seat. The product measures that number itself, from your own receipts, so the tier you are in is arithmetic and not a negotiation.',
    tableCaption: 'Trazum Pro tiers, by managed spend a month',
    columns: { tier: 'Tier', price: 'Price', spend: 'Managed spend a month', share: 'Price as a share of spend' },
    perMonth: (amount) => `${amount} a month`,
    byAgreement: 'By agreement',
    upTo: (amount) => `Up to ${amount}`,
    above: (amount) => `Above ${amount}`,
    breakEven: (tier, share) => `The share is also the break-even: at ${tier}, Pro pays for itself the moment it finds a ${share} saving on a bill it is already watching.`,
    freeLine: (members) => (members === 1 ? 'Free for an organisation of one member. Paid from the second.' : `Free up to ${members} members.`),
    decided: 'These prices were decided, not measured, and nothing is charged today.',
    notOpenTitle: 'Not open yet',
    notOpen:
      'Pro is in development, in a separate private repository. Nobody can use it yet and there is nothing to buy: billing is not built, and it waits until organisations ask for it.',
    cta: 'Tell me when it opens',
    ctaNote: (address) => `This opens your email with a message to ${address} and the subject filled in. The maintainer reads it, and nothing else is done with it: no list, no tracking.`,
    watch: 'Watch the repository’s releases on GitHub',
  },
  es: {
    metaTitle: 'Trazum Pro',
    metaDescription:
      'Trazum Pro, en desarrollo y todavía no abierto: adónde fue el gasto en modelos de una organización, si está dentro de su presupuesto, qué cambió cuando se movió. Ningún texto de un prompt llega a su servidor.',
    status: 'En desarrollo. Todavía no abierto.',
    title: 'Trazum Pro',
    lede: 'La herramienta abierta responde por una persona, con sus propios archivos. Pro responde por una organización, con los recibos que envía cada máquina de ella.',
    answersTitle: 'Qué responde',
    answersLede: 'Cuatro preguntas, para una organización y no para una persona. Pro se queda ahí: no se convierte en un proxy, una pasarela ni una plataforma de monitorización.',
    answers: [
      {
        question: 'Adónde fue el gasto en modelos',
        answer: 'Por proyecto, por modelo y por proveedor, en un periodo, desde cada máquina que envía un recibo.',
      },
      {
        question: 'Si está dentro de su presupuesto',
        answer: 'Topes para la organización o para un proyecto, con lo consumido, el ritmo y la proyección, y un aviso antes de la factura y no después.',
      },
      {
        question: 'Qué cambió cuando se movió',
        answer: 'Por qué se movió la factura: volumen, tamaño, coste unitario y la interacción que no pertenece a ninguno, cuatro términos que suman exactamente el cambio.',
      },
      {
        question: 'Una cifra que un auditor puede rastrear',
        answer: 'Cada cifra dice qué tarifa la produjo y cuándo se revisó esa tarifa por última vez. Un número que nadie puede auditar es lo que Pro existe para sustituir.',
      },
    ],
    propertyTitle: 'Ningún texto de un prompt llega a este servidor.',
    propertyBody:
      'Ni censurado, ni con hash, ni recortado al llegar. El análisis ya se ejecutó en la máquina que hizo la llamada, un portátil o un runner de CI, y lo que viaja es un recibo: recuentos de tokens, el modelo, la tarifa aplicada, la fecha en que se revisó esa tarifa por última vez, la etiqueta de atribución, el periodo y lo que no se pudo tarificar.',
    propertyEmitter: 'El recibo lo genera `trazum receipt`, con `receiptFrom` de `@trazum/core`: MIT, en este repositorio, legible por cualquiera sin pedir nada.',
    propertyTest: 'Una prueba siembra texto de un prompt, una ruta de archivo, un nombre de rama y una credencial en un registro, y falla si alguno llega al recibo.',
    propertyLabel: 'Un campo lo escribes tú: la etiqueta. Viaja tal como la escribiste, así que ponle el nombre de un proyecto y no el de un prompt.',
    propertyRule: 'Una capacidad que necesitaría el prompt no se construye.',
    receiptDocs: 'Cómo se genera un recibo',
    receiptTest: 'Leer la prueba en GitHub',
    splitTitle: 'Gratis para siempre, y lo que añade Pro',
    splitLede:
      'Todo lo que una persona puede calcular con sus propios archivos en su propia máquina es gratis, para siempre, en la herramienta abierta. Pro añade lo que nadie tiene solo: agregación y memoria en un equipo.',
    openTitle: 'La herramienta abierta, MIT',
    openItems: [
      'Cada análisis que hace este repositorio: la factura, las puertas, el optimizador, los precios, los convertidores y los documentos de informe',
      'En tu propia máquina, sin cuenta y sin clave de proveedor para empezar',
      'El recibo que lee Pro, y el código que lo genera',
    ],
    proTitle: 'Trazum Pro',
    proItems: ['Presupuestos y avisos en un equipo', 'Imputación a centros de coste', 'Informes que llegan solos', 'Un registro de auditoría de quién cambió qué', 'Inicio de sesión único'],
    promise:
      'Ningún análisis sale del conjunto abierto para convertirse en una función de Pro. Si Pro necesita un análisis que no existe, se escribe aquí, en abierto, primero. Pro es propietario y se desarrolla aparte, y eso no cambia la licencia de nada de este repositorio.',
    licensingLink: 'Qué es abierto, qué no, y qué no puede moverse',
    tiersTitle: 'Los niveles',
    tiersLede:
      'Un precio fijo para la organización, según el gasto en modelos que gestiona en un mes, no por puesto. El producto mide ese número él mismo, con tus propios recibos, así que tu nivel es aritmética y no una negociación.',
    tableCaption: 'Niveles de Trazum Pro, por gasto gestionado al mes',
    columns: { tier: 'Nivel', price: 'Precio', spend: 'Gasto gestionado al mes', share: 'Precio como parte del gasto' },
    perMonth: (amount) => `${amount} al mes`,
    byAgreement: 'Por acuerdo',
    upTo: (amount) => `Hasta ${amount}`,
    above: (amount) => `Más de ${amount}`,
    breakEven: (tier, share) => `Esa parte es también el punto de equilibrio: en ${tier}, Pro se paga solo en cuanto encuentra un ahorro del ${share} en una factura que ya está vigilando.`,
    freeLine: (members) => (members === 1 ? 'Gratis para una organización de un miembro. De pago a partir del segundo.' : `Gratis hasta ${members} miembros.`),
    decided: 'Estos precios se decidieron, no se midieron, y hoy no se cobra nada.',
    notOpenTitle: 'Todavía no abierto',
    notOpen:
      'Pro está en desarrollo, en un repositorio privado aparte. Nadie puede usarlo todavía y no hay nada que comprar: el cobro no está construido, y espera a que las organizaciones lo pidan.',
    cta: 'Avísame cuando abra',
    ctaNote: (address) => `Esto abre tu correo con un mensaje para ${address} y el asunto ya escrito. Lo lee el mantenedor, y no se hace nada más con él: ninguna lista, ningún seguimiento.`,
    watch: 'Seguir las versiones del repositorio en GitHub',
  },
  fr: {
    metaTitle: 'Trazum Pro',
    metaDescription:
      'Trazum Pro, en développement et pas encore ouvert : où est allée la dépense en modèles d’une organisation, si elle tient dans son budget, ce qui a changé quand elle a bougé. Aucun texte de prompt n’atteint son serveur.',
    status: 'En développement. Pas encore ouvert.',
    title: 'Trazum Pro',
    lede: 'L’outil ouvert répond pour une personne, sur ses propres fichiers. Pro répond pour une organisation, à partir des reçus que chacune de ses machines dépose.',
    answersTitle: 'Ce qu’il répond',
    answersLede: 'Quatre questions, pour une organisation et non pour une personne. Pro s’arrête là : il ne devient ni un proxy, ni une passerelle, ni une plateforme de supervision.',
    answers: [
      {
        question: 'Où est allée la dépense en modèles',
        answer: 'Par projet, par modèle et par fournisseur, sur une période, depuis chaque machine qui dépose un reçu.',
      },
      {
        question: 'Si elle tient dans son budget',
        answer: 'Des plafonds pour l’organisation ou pour un projet, avec ce qui est consommé, le rythme et la projection, et une alerte avant la facture plutôt qu’après.',
      },
      {
        question: 'Ce qui a changé quand elle a bougé',
        answer: 'Pourquoi la facture a bougé : volume, taille, coût unitaire et l’interaction qui n’appartient à aucun d’eux, quatre termes dont la somme est exactement le changement.',
      },
      {
        question: 'Un chiffre qu’un auditeur peut retracer',
        answer: 'Chaque chiffre dit quel tarif l’a produit et quand ce tarif a été revu pour la dernière fois. Un nombre que personne ne peut auditer est ce que Pro existe pour remplacer.',
      },
    ],
    propertyTitle: 'Aucun texte de prompt n’atteint ce serveur.',
    propertyBody:
      'Ni masqué, ni haché, ni tronqué à l’arrivée. L’analyse a déjà eu lieu sur la machine qui a fait l’appel, un portable ou un runner de CI, et ce qui voyage est un reçu : des nombres de tokens, le modèle, le tarif appliqué, la date de dernière revue de ce tarif, l’étiquette d’attribution, la période et ce qui n’a pas pu être tarifé.',
    propertyEmitter: 'Le reçu est produit par `trazum receipt`, avec `receiptFrom` de `@trazum/core` : MIT, dans ce dépôt, lisible par tous sans rien demander.',
    propertyTest: 'Un test place du texte de prompt, un chemin de fichier, un nom de branche et un identifiant secret dans un journal, et échoue si l’un d’eux atteint le reçu.',
    propertyLabel: 'Un champ est le vôtre : l’étiquette. Elle voyage telle que vous l’avez écrite, alors donnez-lui le nom d’un projet et non celui d’un prompt.',
    propertyRule: 'Une capacité qui aurait besoin du prompt n’est pas construite.',
    receiptDocs: 'Comment un reçu est produit',
    receiptTest: 'Lire le test sur GitHub',
    splitTitle: 'Gratuit pour toujours, et ce que Pro ajoute',
    splitLede:
      'Tout ce qu’une personne peut calculer à partir de ses propres fichiers sur sa propre machine est gratuit, pour toujours, dans l’outil ouvert. Pro ajoute ce que personne n’a seul : l’agrégation et la mémoire à l’échelle d’une équipe.',
    openTitle: 'L’outil ouvert, MIT',
    openItems: [
      'Chaque analyse que fait ce dépôt : la facture, les portes, l’optimiseur, la tarification, les convertisseurs et les documents de rapport',
      'Sur votre propre machine, sans compte et sans clé de fournisseur pour commencer',
      'Le reçu que lit Pro, et le code qui le produit',
    ],
    proTitle: 'Trazum Pro',
    proItems: ['Budgets et alertes pour une équipe', 'Refacturation aux centres de coût', 'Des rapports qui arrivent d’eux-mêmes', 'Un journal d’audit de qui a changé quoi', 'Authentification unique'],
    promise:
      'Aucune analyse ne quitte l’ensemble ouvert pour devenir une fonction de Pro. Si Pro a besoin d’une analyse qui n’existe pas, elle est écrite ici, en ouvert, d’abord. Pro est propriétaire et développé à part, et cela ne change la licence de rien dans ce dépôt.',
    licensingLink: 'Ce qui est ouvert, ce qui ne l’est pas, et ce qui ne peut pas bouger',
    tiersTitle: 'Les paliers',
    tiersLede:
      'Un prix fixe pour l’organisation, selon la dépense en modèles qu’elle gère en un mois, et non par siège. Le produit mesure ce nombre lui-même, à partir de vos propres reçus, donc votre palier est une question d’arithmétique et non de négociation.',
    tableCaption: 'Paliers de Trazum Pro, par dépense gérée par mois',
    columns: { tier: 'Palier', price: 'Prix', spend: 'Dépense gérée par mois', share: 'Prix en part de la dépense' },
    perMonth: (amount) => `${amount} par mois`,
    byAgreement: 'Sur accord',
    upTo: (amount) => `Jusqu’à ${amount}`,
    above: (amount) => `Au-delà de ${amount}`,
    breakEven: (tier, share) => `Cette part est aussi le seuil de rentabilité : en ${tier}, Pro se rembourse dès qu’il trouve une économie de ${share} sur une facture qu’il surveille déjà.`,
    freeLine: (members) => (members === 1 ? 'Gratuit pour une organisation d’un seul membre. Payant à partir du deuxième.' : `Gratuit jusqu’à ${members} membres.`),
    decided: 'Ces prix ont été décidés, pas mesurés, et rien n’est facturé aujourd’hui.',
    notOpenTitle: 'Pas encore ouvert',
    notOpen:
      'Pro est en développement, dans un dépôt privé distinct. Personne ne peut encore l’utiliser et il n’y a rien à acheter : la facturation n’est pas construite, et elle attend que des organisations la demandent.',
    cta: 'Prévenez-moi à l’ouverture',
    ctaNote: (address) => `Ceci ouvre votre messagerie avec un message pour ${address} et l’objet déjà rempli. Le mainteneur le lit, et rien d’autre n’en est fait : aucune liste, aucun suivi.`,
    watch: 'Suivre les versions du dépôt sur GitHub',
  },
  de: {
    metaTitle: 'Trazum Pro',
    metaDescription:
      'Trazum Pro, in Entwicklung und noch nicht geöffnet: wohin die Modellausgaben einer Organisation gingen, ob sie im Budget liegen, was sich änderte, als sie sich bewegten. Kein Prompt-Text erreicht seinen Server.',
    status: 'In Entwicklung. Noch nicht geöffnet.',
    title: 'Trazum Pro',
    lede: 'Das offene Werkzeug antwortet für eine Person, aus ihren eigenen Dateien. Pro antwortet für eine Organisation, aus den Belegen, die jede ihrer Maschinen einreicht.',
    answersTitle: 'Was es beantwortet',
    answersLede: 'Vier Fragen, für eine Organisation und nicht für eine Person. Pro hört dort auf: Es wird weder ein Proxy noch ein Gateway noch eine Monitoring-Plattform.',
    answers: [
      {
        question: 'Wohin die Modellausgaben gingen',
        answer: 'Nach Projekt, nach Modell und nach Anbieter, über einen Zeitraum, von jeder Maschine, die einen Beleg einreicht.',
      },
      {
        question: 'Ob sie im Budget liegen',
        answer: 'Obergrenzen für die Organisation oder ein Projekt, mit Verbrauch, Verbrauchsrate und Prognose, und eine Warnung vor der Rechnung statt danach.',
      },
      {
        question: 'Was sich änderte, als sie sich bewegten',
        answer: 'Warum sich die Rechnung bewegte: Menge, Größe, Stückkosten und die Wechselwirkung, die zu keinem davon gehört, vier Terme, die genau die Änderung ergeben.',
      },
      {
        question: 'Eine Zahl, die ein Prüfer nachvollziehen kann',
        answer: 'Jede Zahl sagt, welcher Tarif sie erzeugt hat und wann dieser Tarif zuletzt geprüft wurde. Eine Zahl, die niemand prüfen kann, ist das, was Pro ersetzen soll.',
      },
    ],
    propertyTitle: 'Kein Prompt-Text erreicht diesen Server.',
    propertyBody:
      'Nicht geschwärzt, nicht gehasht, nicht bei Ankunft gekürzt. Die Analyse lief bereits auf der Maschine, die den Aufruf machte, einem Laptop oder einem CI-Runner, und was übertragen wird, ist ein Beleg: Tokenzahlen, das Modell, der angewandte Tarif, das Datum seiner letzten Prüfung, das Zuordnungslabel, der Zeitraum und was nicht bepreist werden konnte.',
    propertyEmitter: 'Der Beleg entsteht mit `trazum receipt`, durch `receiptFrom` aus `@trazum/core`: MIT, in diesem Repository, für jeden lesbar, ohne um etwas zu bitten.',
    propertyTest: 'Ein Test legt Prompt-Text, einen Dateipfad, einen Branch-Namen und ein Zugangsdatum in ein Protokoll und schlägt fehl, wenn eines davon den Beleg erreicht.',
    propertyLabel: 'Ein Feld schreiben Sie selbst: das Label. Es wird so übertragen, wie Sie es geschrieben haben, also benennen Sie es nach einem Projekt und nicht nach einem Prompt.',
    propertyRule: 'Eine Fähigkeit, die den Prompt bräuchte, wird nicht gebaut.',
    receiptDocs: 'Wie ein Beleg entsteht',
    receiptTest: 'Den Test auf GitHub lesen',
    splitTitle: 'Für immer kostenlos, und was Pro hinzufügt',
    splitLede:
      'Alles, was eine Person aus ihren eigenen Dateien auf ihrer eigenen Maschine berechnen kann, ist kostenlos, für immer, im offenen Werkzeug. Pro fügt hinzu, was niemand allein hat: Zusammenführung und Gedächtnis über ein Team.',
    openTitle: 'Das offene Werkzeug, MIT',
    openItems: [
      'Jede Analyse, die dieses Repository ausführt: die Rechnung, die Gates, der Optimierer, die Preise, die Konverter und die Berichtsdokumente',
      'Auf Ihrer eigenen Maschine, ohne Konto und ohne Anbieterschlüssel für den Anfang',
      'Der Beleg, den Pro liest, und der Code, der ihn erzeugt',
    ],
    proTitle: 'Trazum Pro',
    proItems: ['Budgets und Warnungen für ein Team', 'Verrechnung auf Kostenstellen', 'Berichte, die von selbst kommen', 'Ein Prüfprotokoll, wer was geändert hat', 'Single Sign-on'],
    promise:
      'Keine Analyse verlässt den offenen Bestand, um eine Funktion von Pro zu werden. Braucht Pro eine Analyse, die es nicht gibt, wird sie zuerst hier geschrieben, offen. Pro ist proprietär und wird getrennt entwickelt, und das ändert an der Lizenz von nichts in diesem Repository etwas.',
    licensingLink: 'Was offen ist, was nicht, und was sich nicht bewegen kann',
    tiersTitle: 'Die Stufen',
    tiersLede:
      'Ein Festpreis für die Organisation, nach den Modellausgaben, die sie im Monat verwaltet, nicht pro Sitzplatz. Das Produkt misst diese Zahl selbst, aus Ihren eigenen Belegen, also ist Ihre Stufe Arithmetik und keine Verhandlung.',
    tableCaption: 'Stufen von Trazum Pro, nach verwalteten Ausgaben im Monat',
    columns: { tier: 'Stufe', price: 'Preis', spend: 'Verwaltete Ausgaben im Monat', share: 'Preis als Anteil der Ausgaben' },
    perMonth: (amount) => `${amount} im Monat`,
    byAgreement: 'Nach Vereinbarung',
    upTo: (amount) => `Bis ${amount}`,
    above: (amount) => `Über ${amount}`,
    breakEven: (tier, share) => `Der Anteil ist auch die Gewinnschwelle: Bei ${tier} hat sich Pro bezahlt gemacht, sobald es eine Einsparung von ${share} auf einer Rechnung findet, die es bereits beobachtet.`,
    freeLine: (members) => (members === 1 ? 'Kostenlos für eine Organisation mit einem Mitglied. Kostenpflichtig ab dem zweiten.' : `Kostenlos bis ${members} Mitglieder.`),
    decided: 'Diese Preise wurden entschieden, nicht gemessen, und heute wird nichts berechnet.',
    notOpenTitle: 'Noch nicht geöffnet',
    notOpen:
      'Pro ist in Entwicklung, in einem separaten privaten Repository. Noch niemand kann es nutzen, und es gibt nichts zu kaufen: Die Abrechnung ist nicht gebaut und wartet, bis Organisationen danach fragen.',
    cta: 'Sagen Sie mir, wenn es öffnet',
    ctaNote: (address) => `Das öffnet Ihr E-Mail-Programm mit einer Nachricht an ${address} und ausgefülltem Betreff. Der Maintainer liest sie, und sonst geschieht nichts damit: keine Liste, kein Tracking.`,
    watch: 'Die Releases des Repositorys auf GitHub beobachten',
  },
  pt: {
    metaTitle: 'Trazum Pro',
    metaDescription:
      'Trazum Pro, em desenvolvimento e ainda não aberto: para onde foi o gasto em modelos de uma organização, se está dentro do orçamento, o que mudou quando se moveu. Nenhum texto de prompt chega ao seu servidor.',
    status: 'Em desenvolvimento. Ainda não aberto.',
    title: 'Trazum Pro',
    lede: 'A ferramenta aberta responde por uma pessoa, com os seus próprios ficheiros. O Pro responde por uma organização, com os recibos que cada uma das suas máquinas envia.',
    answersTitle: 'O que responde',
    answersLede: 'Quatro perguntas, para uma organização e não para uma pessoa. O Pro fica por aí: não se torna um proxy, um gateway nem uma plataforma de monitorização.',
    answers: [
      {
        question: 'Para onde foi o gasto em modelos',
        answer: 'Por projeto, por modelo e por fornecedor, num período, a partir de cada máquina que envia um recibo.',
      },
      {
        question: 'Se está dentro do orçamento',
        answer: 'Tetos para a organização ou para um projeto, com o consumido, o ritmo e a projeção, e um alerta antes da fatura e não depois.',
      },
      {
        question: 'O que mudou quando se moveu',
        answer: 'Porque é que a fatura se moveu: volume, tamanho, custo unitário e a interação que não pertence a nenhum deles, quatro termos que somam exatamente a mudança.',
      },
      {
        question: 'Um número que um auditor consegue rastrear',
        answer: 'Cada número diz que tarifa o produziu e quando essa tarifa foi revista pela última vez. Um número que ninguém consegue auditar é o que o Pro existe para substituir.',
      },
    ],
    propertyTitle: 'Nenhum texto de prompt chega a este servidor.',
    propertyBody:
      'Nem ocultado, nem com hash, nem cortado à chegada. A análise já correu na máquina que fez a chamada, um portátil ou um runner de CI, e o que viaja é um recibo: contagens de tokens, o modelo, a tarifa aplicada, a data em que essa tarifa foi revista pela última vez, a etiqueta de atribuição, o período e o que não foi possível tarifar.',
    propertyEmitter: 'O recibo é gerado por `trazum receipt`, com `receiptFrom` de `@trazum/core`: MIT, neste repositório, legível por qualquer pessoa sem pedir nada.',
    propertyTest: 'Um teste coloca texto de prompt, um caminho de ficheiro, um nome de branch e uma credencial num registo, e falha se algum deles chegar ao recibo.',
    propertyLabel: 'Um campo é escrito por si: a etiqueta. Viaja tal como a escreveu, por isso dê-lhe o nome de um projeto e não o de um prompt.',
    propertyRule: 'Uma capacidade que precisaria do prompt não é construída.',
    receiptDocs: 'Como é gerado um recibo',
    receiptTest: 'Ler o teste no GitHub',
    splitTitle: 'Grátis para sempre, e o que o Pro acrescenta',
    splitLede:
      'Tudo o que uma pessoa consegue calcular com os seus próprios ficheiros na sua própria máquina é grátis, para sempre, na ferramenta aberta. O Pro acrescenta o que ninguém tem sozinho: agregação e memória numa equipa.',
    openTitle: 'A ferramenta aberta, MIT',
    openItems: [
      'Cada análise que este repositório faz: a fatura, os gates, o otimizador, os preços, os conversores e os documentos de relatório',
      'Na sua própria máquina, sem conta e sem chave de fornecedor para começar',
      'O recibo que o Pro lê, e o código que o gera',
    ],
    proTitle: 'Trazum Pro',
    proItems: ['Orçamentos e alertas numa equipa', 'Imputação a centros de custo', 'Relatórios que chegam sozinhos', 'Um registo de auditoria de quem mudou o quê', 'Início de sessão único'],
    promise:
      'Nenhuma análise sai do conjunto aberto para se tornar uma função do Pro. Se o Pro precisar de uma análise que não existe, ela é escrita aqui, em aberto, primeiro. O Pro é proprietário e desenvolvido à parte, e isso não muda a licença de nada neste repositório.',
    licensingLink: 'O que é aberto, o que não é, e o que não pode mudar de lugar',
    tiersTitle: 'Os escalões',
    tiersLede:
      'Um preço fixo para a organização, pelo gasto em modelos que gere num mês, e não por lugar. O produto mede esse número sozinho, a partir dos seus próprios recibos, por isso o seu escalão é aritmética e não uma negociação.',
    tableCaption: 'Escalões do Trazum Pro, por gasto gerido por mês',
    columns: { tier: 'Escalão', price: 'Preço', spend: 'Gasto gerido por mês', share: 'Preço como parte do gasto' },
    perMonth: (amount) => `${amount} por mês`,
    byAgreement: 'Por acordo',
    upTo: (amount) => `Até ${amount}`,
    above: (amount) => `Acima de ${amount}`,
    breakEven: (tier, share) => `Essa parte é também o ponto de equilíbrio: no ${tier}, o Pro paga-se a si próprio assim que encontra uma poupança de ${share} numa fatura que já está a vigiar.`,
    freeLine: (members) => (members === 1 ? 'Grátis para uma organização de um membro. Pago a partir do segundo.' : `Grátis até ${members} membros.`),
    decided: 'Estes preços foram decididos, não medidos, e hoje nada é cobrado.',
    notOpenTitle: 'Ainda não aberto',
    notOpen:
      'O Pro está em desenvolvimento, num repositório privado à parte. Ninguém o pode usar ainda e não há nada para comprar: a cobrança não está construída, e espera até que as organizações a peçam.',
    cta: 'Avise-me quando abrir',
    ctaNote: (address) => `Isto abre o seu email com uma mensagem para ${address} e o assunto já preenchido. O mantenedor lê-a, e nada mais é feito com ela: nenhuma lista, nenhum rastreio.`,
    watch: 'Acompanhar as versões do repositório no GitHub',
  },
};
