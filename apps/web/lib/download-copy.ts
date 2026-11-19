import type { MarketingLocale } from './marketing-locales';

/**
 * The words of `/download`, in the five languages the public site speaks.
 *
 * No command, address, name of a file or version is written in these words:
 * they come from `lib/download.ts`, which reads what
 * `scripts/build-site-pages.mjs` wrote from the repository's own sources, and
 * the page draws them. What is written here is what to do with them, and what
 * each is not. `download-page.test.mjs` checks the keys match in every
 * language, that none is empty or has an em-dash, and that no sentence claims
 * a store listing: this page names none, because none exists.
 *
 * French, German and Portuguese are machine-drafted and unreviewed, as the
 * banner the site shows in them says.
 */
export interface DownloadCopy {
  metaTitle: string;
  metaDescription: string;
  title: string;
  lede: string;
  /** "This page is for version X", the version the site was built at. */
  versionLine: (version: string) => string;
  availability: string;
  releasePage: string;

  cliTitle: string;
  cliLede: string;
  cliOnce: string;
  cliGlobal: string;
  cliBrew: string;
  cliBrewNote: string;

  mcpTitle: string;
  mcpLede: string;
  mcpWhere: string;
  mcpBundleButton: (file: string) => string;
  mcpBundleNote: string;
  mcpDocs: string;
  /** What the Gemini CLI line does, since its version is held by the file it installs. */
  mcpGeminiNote: string;

  extTitle: string;
  extLede: string;
  extButton: (file: string) => string;
  extSteps: readonly string[];
  extTerminal: string;
  extNote: string;

  actionTitle: string;
  actionLede: string;
  actionNote: string;
  actionDocs: string;

  sumsTitle: string;
  sumsLede: string;
  sumsLink: string;
  sbomLink: string;
  sumsLinux: string;
  sumsMac: string;
  sumsNote: string;
}

export const DOWNLOAD_COPY: Record<MarketingLocale, DownloadCopy> = {
  en: {
    metaTitle: 'Download',
    metaDescription:
      'Install Trazum: the command line from npm or Homebrew, the MCP server for each client, the editor extension as a file, the GitHub Action, and the checksums of what each release carries. No account and no store.',
    title: 'Download Trazum',
    lede: 'Everything here comes from npm or from this repository’s own releases. No account, no sign-in and no store: each file is a release asset, and the checksums are below.',
    versionLine: (version) => `This page is for version ${version}.`,
    availability:
      'The release workflow attaches the files after npm serves the packages. A link that answers not found means that has not happened yet for this version; the release page lists what it carries.',
    releasePage: 'This version’s release page',

    cliTitle: 'Command line',
    cliLede: 'Needs Node.js 20 or newer. The version is written in each command, so what you run is what this page was built for. Leave `@<version>` out to take the newest.',
    cliOnce: 'Run it once, install nothing',
    cliGlobal: 'Install it for every project',
    cliBrew: 'From the Homebrew tap',
    cliBrewNote: 'The tap is `Davmunrey/homebrew-trazum`. The maintainer updates it by hand after each release, so it can name an older version than npm.',

    mcpTitle: 'MCP server',
    mcpLede:
      'Each line starts `@trazum/mcp` at the exact version this page is for. The server answers when a client asks it: it does not sit in front of the client’s model calls and it opens no file of yours.',
    mcpWhere: 'Where it goes',
    mcpBundleButton: (file) => `Download ${file}`,
    mcpBundleNote: 'Open the file with Claude Desktop to install the server. The bundle is not signed.',
    mcpDocs: 'The same table is in the documentation',
    mcpGeminiNote: 'This installs the extension from the repository’s default branch. Its gemini-extension.json starts the server at the exact version.',

    extTitle: 'Editor extension',
    extLede: 'What the prompt in front of you costs, counted on your machine, in the status bar. It installs from a file in VS Code, and in editors built on it, with Install from VSIX. It needs VS Code 1.90 or newer.',
    extButton: (file) => `Download ${file}`,
    extSteps: [
      'Download the file with the button above.',
      'In the editor, open Extensions, choose the three-dot menu at the top of the list, then Install from VSIX, and pick the file.',
    ],
    extTerminal: 'Or from a terminal, in the folder you downloaded it to',
    extNote: 'It sends nothing anywhere: its tests scan its source for a way out and the permitted set is empty.',

    actionTitle: 'GitHub Action',
    actionLede: 'Pin the Action to a commit, never a tag. This is the line the setup guide documents, at the release its comment names:',
    actionNote: 'The commit is the newest release a reader is told to pin, so it can be one release behind this page.',
    actionDocs: 'The setup guide',

    sumsTitle: 'Checksums',
    sumsLede: 'SHA256SUMS lists the SHA-256 of the extension, the MCP bundle and the bill of materials of this release.',
    sumsLink: 'Download SHA256SUMS',
    sbomLink: 'The bill of materials',
    sumsLinux: 'Put the files and SHA256SUMS in one folder. On Linux:',
    sumsMac: 'On macOS, print a file’s digest and compare it with its line in SHA256SUMS:',
    sumsNote: 'A checksum shows that a file is the one the release lists. It does not show who made it: these files carry no signature and no attestation.',
  },
  es: {
    metaTitle: 'Descargar',
    metaDescription:
      'Instala Trazum: la línea de comandos desde npm o Homebrew, el servidor MCP para cada cliente, la extensión del editor como archivo, la GitHub Action y las sumas de verificación de cada versión. Sin cuenta y sin tienda.',
    title: 'Descargar Trazum',
    lede: 'Todo lo de aquí sale de npm o de las versiones de este mismo repositorio. Sin cuenta, sin inicio de sesión y sin tienda: cada archivo es un adjunto de la versión, y abajo están las sumas de verificación.',
    versionLine: (version) => `Esta página es para la versión ${version}.`,
    availability:
      'El flujo de publicación adjunta los archivos después de que npm sirva los paquetes. Un enlace que responde «no encontrado» indica que aún no ha ocurrido para esta versión; la página de la versión lista lo que lleva.',
    releasePage: 'Página de esta versión',

    cliTitle: 'Línea de comandos',
    cliLede: 'Requiere Node.js 20 o superior. La versión está escrita en cada comando, así que lo que ejecutas es aquello para lo que se construyó esta página. Quita `@<versión>` para tomar la más reciente.',
    cliOnce: 'Ejecútalo una vez, sin instalar nada',
    cliGlobal: 'Instálalo para todos tus proyectos',
    cliBrew: 'Desde el tap de Homebrew',
    cliBrewNote: 'El tap es `Davmunrey/homebrew-trazum`. El responsable lo actualiza a mano tras cada versión, así que puede nombrar una versión anterior a la de npm.',

    mcpTitle: 'Servidor MCP',
    mcpLede:
      'Cada línea arranca `@trazum/mcp` en la versión exacta de esta página. El servidor responde cuando un cliente se lo pide: no se interpone en las llamadas del cliente a su modelo y no abre ningún archivo tuyo.',
    mcpWhere: 'Dónde va',
    mcpBundleButton: (file) => `Descargar ${file}`,
    mcpBundleNote: 'Abre el archivo con Claude Desktop para instalar el servidor. El paquete no está firmado.',
    mcpDocs: 'La misma tabla está en la documentación',
    mcpGeminiNote: 'Esto instala la extensión desde la rama por defecto del repositorio. Su gemini-extension.json arranca el servidor en la versión exacta.',

    extTitle: 'Extensión del editor',
    extLede: 'Lo que cuesta el prompt que tienes delante, contado en tu máquina, en la barra de estado. Se instala desde un archivo en VS Code, y en editores basados en él, con Instalar desde VSIX. Requiere VS Code 1.90 o superior.',
    extButton: (file) => `Descargar ${file}`,
    extSteps: [
      'Descarga el archivo con el botón de arriba.',
      'En el editor, abre Extensiones, elige el menú de tres puntos al principio de la lista, luego Instalar desde VSIX, y selecciona el archivo.',
    ],
    extTerminal: 'O desde una terminal, en la carpeta donde lo descargaste',
    extNote: 'No envía nada a ninguna parte: sus pruebas recorren su código en busca de una salida y el conjunto permitido está vacío.',

    actionTitle: 'GitHub Action',
    actionLede: 'Fija la Action a un commit, nunca a una etiqueta. Esta es la línea que documenta la guía de instalación, en la versión que nombra su comentario:',
    actionNote: 'El commit es la versión más reciente que se indica fijar, así que puede ir una versión por detrás de esta página.',
    actionDocs: 'La guía de instalación',

    sumsTitle: 'Sumas de verificación',
    sumsLede: 'SHA256SUMS lista el SHA-256 de la extensión, del paquete MCP y de la lista de materiales de esta versión.',
    sumsLink: 'Descargar SHA256SUMS',
    sbomLink: 'La lista de materiales',
    sumsLinux: 'Pon los archivos y SHA256SUMS en una misma carpeta. En Linux:',
    sumsMac: 'En macOS, imprime la suma de un archivo y compárala con su línea en SHA256SUMS:',
    sumsNote: 'Una suma de verificación muestra que el archivo es el que lista la versión. No muestra quién lo hizo: estos archivos no llevan firma ni atestación.',
  },
  fr: {
    metaTitle: 'Télécharger',
    metaDescription:
      'Installer Trazum : la ligne de commande depuis npm ou Homebrew, le serveur MCP pour chaque client, l’extension d’éditeur en fichier, la GitHub Action et les sommes de contrôle de chaque version. Sans compte et sans boutique.',
    title: 'Télécharger Trazum',
    lede: 'Tout ce qui suit vient de npm ou des versions de ce dépôt. Pas de compte, pas de connexion et pas de boutique : chaque fichier est une pièce jointe de la version, et les sommes de contrôle sont plus bas.',
    versionLine: (version) => `Cette page correspond à la version ${version}.`,
    availability:
      'Le workflow de publication joint les fichiers une fois que npm sert les paquets. Un lien qui répond « introuvable » signifie que ce n’est pas encore fait pour cette version ; la page de la version liste ce qu’elle contient.',
    releasePage: 'Page de cette version',

    cliTitle: 'Ligne de commande',
    cliLede: 'Nécessite Node.js 20 ou plus récent. La version est écrite dans chaque commande : ce que vous lancez est ce pour quoi cette page a été construite. Retirez `@<version>` pour prendre la plus récente.',
    cliOnce: 'Lancer une fois, sans rien installer',
    cliGlobal: 'Installer pour tous les projets',
    cliBrew: 'Depuis le tap Homebrew',
    cliBrewNote: 'Le tap est `Davmunrey/homebrew-trazum`. Le mainteneur le met à jour à la main après chaque version ; il peut donc nommer une version plus ancienne que npm.',

    mcpTitle: 'Serveur MCP',
    mcpLede:
      'Chaque ligne démarre `@trazum/mcp` à la version exacte de cette page. Le serveur répond quand un client le lui demande : il ne se place pas devant les appels du client à son modèle et n’ouvre aucun de vos fichiers.',
    mcpWhere: 'Où le placer',
    mcpBundleButton: (file) => `Télécharger ${file}`,
    mcpBundleNote: 'Ouvrez le fichier avec Claude Desktop pour installer le serveur. Le paquet n’est pas signé.',
    mcpDocs: 'Le même tableau figure dans la documentation',
    mcpGeminiNote: 'Cela installe l’extension depuis la branche par défaut du dépôt. Son gemini-extension.json démarre le serveur à la version exacte.',

    extTitle: 'Extension d’éditeur',
    extLede: 'Ce que coûte le prompt que vous avez sous les yeux, compté sur votre machine, dans la barre d’état. Elle s’installe depuis un fichier dans VS Code, et dans les éditeurs qui en dérivent, avec Installer depuis un VSIX. Elle exige VS Code 1.90 ou plus récent.',
    extButton: (file) => `Télécharger ${file}`,
    extSteps: [
      'Téléchargez le fichier avec le bouton ci-dessus.',
      'Dans l’éditeur, ouvrez Extensions, choisissez le menu à trois points en haut de la liste, puis Installer depuis un VSIX, et sélectionnez le fichier.',
    ],
    extTerminal: 'Ou depuis un terminal, dans le dossier où vous l’avez téléchargé',
    extNote: 'Elle n’envoie rien nulle part : ses tests parcourent son code à la recherche d’une sortie et l’ensemble autorisé est vide.',

    actionTitle: 'GitHub Action',
    actionLede: 'Épinglez l’Action sur un commit, jamais sur une étiquette. Voici la ligne que documente le guide d’installation, à la version que nomme son commentaire :',
    actionNote: 'Le commit est la version la plus récente qu’on invite à épingler ; il peut donc avoir une version de retard sur cette page.',
    actionDocs: 'Le guide d’installation',

    sumsTitle: 'Sommes de contrôle',
    sumsLede: 'SHA256SUMS liste le SHA-256 de l’extension, du paquet MCP et de la nomenclature des composants de cette version.',
    sumsLink: 'Télécharger SHA256SUMS',
    sbomLink: 'La nomenclature des composants',
    sumsLinux: 'Placez les fichiers et SHA256SUMS dans un même dossier. Sous Linux :',
    sumsMac: 'Sous macOS, affichez l’empreinte d’un fichier et comparez-la à sa ligne dans SHA256SUMS :',
    sumsNote: 'Une somme de contrôle montre qu’un fichier est celui que la version liste. Elle ne montre pas qui l’a fait : ces fichiers ne portent ni signature ni attestation.',
  },
  de: {
    metaTitle: 'Herunterladen',
    metaDescription:
      'Trazum installieren: die Kommandozeile über npm oder Homebrew, der MCP-Server für jeden Client, die Editor-Erweiterung als Datei, die GitHub Action und die Prüfsummen jeder Version. Ohne Konto und ohne Store.',
    title: 'Trazum herunterladen',
    lede: 'Alles hier stammt von npm oder aus den Releases dieses Repositorys. Kein Konto, keine Anmeldung und kein Store: Jede Datei ist ein Anhang des Releases, die Prüfsummen stehen weiter unten.',
    versionLine: (version) => `Diese Seite gilt für Version ${version}.`,
    availability:
      'Der Release-Workflow hängt die Dateien an, nachdem npm die Pakete ausliefert. Antwortet ein Link mit „nicht gefunden“, ist das für diese Version noch nicht geschehen; die Release-Seite listet, was sie enthält.',
    releasePage: 'Release-Seite dieser Version',

    cliTitle: 'Kommandozeile',
    cliLede: 'Benötigt Node.js 20 oder neuer. Die Version steht in jedem Befehl, sodass Sie ausführen, wofür diese Seite gebaut wurde. Lassen Sie `@<Version>` weg, um die neueste zu nehmen.',
    cliOnce: 'Einmal ausführen, nichts installieren',
    cliGlobal: 'Für alle Projekte installieren',
    cliBrew: 'Aus dem Homebrew-Tap',
    cliBrewNote: 'Der Tap heißt `Davmunrey/homebrew-trazum`. Der Maintainer aktualisiert ihn nach jedem Release von Hand; er kann daher eine ältere Version nennen als npm.',

    mcpTitle: 'MCP-Server',
    mcpLede:
      'Jede Zeile startet `@trazum/mcp` in der genauen Version dieser Seite. Der Server antwortet, wenn ein Client ihn fragt: Er schaltet sich nicht vor die Modellaufrufe des Clients und öffnet keine Ihrer Dateien.',
    mcpWhere: 'Wohin es gehört',
    mcpBundleButton: (file) => `${file} herunterladen`,
    mcpBundleNote: 'Öffnen Sie die Datei mit Claude Desktop, um den Server zu installieren. Das Bundle ist nicht signiert.',
    mcpDocs: 'Dieselbe Tabelle steht in der Dokumentation',
    mcpGeminiNote: 'Das installiert die Erweiterung vom Standard-Branch des Repositorys. Ihre gemini-extension.json startet den Server in der genauen Version.',

    extTitle: 'Editor-Erweiterung',
    extLede: 'Was der Prompt vor Ihnen kostet, auf Ihrem Rechner gezählt, in der Statusleiste. Sie wird in VS Code und in darauf aufbauenden Editoren aus einer Datei installiert, mit „Aus VSIX installieren“. Sie braucht VS Code 1.90 oder neuer.',
    extButton: (file) => `${file} herunterladen`,
    extSteps: [
      'Laden Sie die Datei mit der Schaltfläche oben herunter.',
      'Öffnen Sie im Editor „Erweiterungen“, wählen Sie das Drei-Punkte-Menü oben in der Liste, dann „Aus VSIX installieren“, und wählen Sie die Datei.',
    ],
    extTerminal: 'Oder im Terminal, in dem Ordner, in den Sie sie geladen haben',
    extNote: 'Sie sendet nirgendwohin etwas: Ihre Tests durchsuchen den Quelltext nach einem Ausgang, und die erlaubte Menge ist leer.',

    actionTitle: 'GitHub Action',
    actionLede: 'Pinnen Sie die Action auf einen Commit, nie auf ein Tag. Das ist die Zeile, die die Einrichtungsanleitung dokumentiert, in dem Release, das ihr Kommentar nennt:',
    actionNote: 'Der Commit ist das neueste Release, das zum Pinnen empfohlen wird; er kann also ein Release hinter dieser Seite liegen.',
    actionDocs: 'Die Einrichtungsanleitung',

    sumsTitle: 'Prüfsummen',
    sumsLede: 'SHA256SUMS listet das SHA-256 der Erweiterung, des MCP-Bundles und der Stückliste dieses Releases.',
    sumsLink: 'SHA256SUMS herunterladen',
    sbomLink: 'Die Stückliste',
    sumsLinux: 'Legen Sie die Dateien und SHA256SUMS in einen Ordner. Unter Linux:',
    sumsMac: 'Unter macOS geben Sie die Prüfsumme einer Datei aus und vergleichen sie mit ihrer Zeile in SHA256SUMS:',
    sumsNote: 'Eine Prüfsumme zeigt, dass eine Datei die ist, die das Release listet. Sie zeigt nicht, wer sie gebaut hat: Diese Dateien tragen weder Signatur noch Attestierung.',
  },
  pt: {
    metaTitle: 'Baixar',
    metaDescription:
      'Instale o Trazum: a linha de comando pelo npm ou Homebrew, o servidor MCP para cada cliente, a extensão do editor como arquivo, a GitHub Action e as somas de verificação de cada versão. Sem conta e sem loja.',
    title: 'Baixar o Trazum',
    lede: 'Tudo aqui vem do npm ou das versões deste repositório. Sem conta, sem login e sem loja: cada arquivo é um anexo da versão, e as somas de verificação estão abaixo.',
    versionLine: (version) => `Esta página é para a versão ${version}.`,
    availability:
      'O fluxo de publicação anexa os arquivos depois que o npm serve os pacotes. Um link que responde «não encontrado» indica que isso ainda não aconteceu para esta versão; a página da versão lista o que ela contém.',
    releasePage: 'Página desta versão',

    cliTitle: 'Linha de comando',
    cliLede: 'Requer Node.js 20 ou superior. A versão está escrita em cada comando, então o que você executa é aquilo para o qual esta página foi construída. Tire `@<versão>` para pegar a mais recente.',
    cliOnce: 'Execute uma vez, sem instalar nada',
    cliGlobal: 'Instale para todos os projetos',
    cliBrew: 'Pelo tap do Homebrew',
    cliBrewNote: 'O tap é `Davmunrey/homebrew-trazum`. O mantenedor o atualiza à mão após cada versão, então ele pode citar uma versão mais antiga que a do npm.',

    mcpTitle: 'Servidor MCP',
    mcpLede:
      'Cada linha inicia `@trazum/mcp` na versão exata desta página. O servidor responde quando um cliente pergunta: ele não se coloca na frente das chamadas do cliente ao seu modelo e não abre nenhum arquivo seu.',
    mcpWhere: 'Onde colocar',
    mcpBundleButton: (file) => `Baixar ${file}`,
    mcpBundleNote: 'Abra o arquivo com o Claude Desktop para instalar o servidor. O pacote não é assinado.',
    mcpDocs: 'A mesma tabela está na documentação',
    mcpGeminiNote: 'Isto instala a extensão a partir do branch padrão do repositório. O gemini-extension.json dela inicia o servidor na versão exata.',

    extTitle: 'Extensão do editor',
    extLede: 'O que custa o prompt à sua frente, contado na sua máquina, na barra de status. Instala-se a partir de um arquivo no VS Code, e em editores baseados nele, com Instalar a partir do VSIX. Requer VS Code 1.90 ou superior.',
    extButton: (file) => `Baixar ${file}`,
    extSteps: [
      'Baixe o arquivo com o botão acima.',
      'No editor, abra Extensões, escolha o menu de três pontos no topo da lista, depois Instalar a partir do VSIX, e selecione o arquivo.',
    ],
    extTerminal: 'Ou em um terminal, na pasta onde você o baixou',
    extNote: 'Ela não envia nada a lugar nenhum: seus testes varrem o código em busca de uma saída e o conjunto permitido está vazio.',

    actionTitle: 'GitHub Action',
    actionLede: 'Fixe a Action em um commit, nunca em uma tag. Esta é a linha que o guia de instalação documenta, na versão que o seu comentário nomeia:',
    actionNote: 'O commit é a versão mais recente que se indica fixar, então pode estar uma versão atrás desta página.',
    actionDocs: 'O guia de instalação',

    sumsTitle: 'Somas de verificação',
    sumsLede: 'SHA256SUMS lista o SHA-256 da extensão, do pacote MCP e da lista de materiais desta versão.',
    sumsLink: 'Baixar SHA256SUMS',
    sbomLink: 'A lista de materiais',
    sumsLinux: 'Coloque os arquivos e o SHA256SUMS em uma mesma pasta. No Linux:',
    sumsMac: 'No macOS, imprima a soma de um arquivo e compare com a linha dele no SHA256SUMS:',
    sumsNote: 'Uma soma de verificação mostra que o arquivo é o que a versão lista. Não mostra quem o fez: estes arquivos não têm assinatura nem atestação.',
  },
};
