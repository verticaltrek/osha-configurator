// ==========================================
// HOOKT LIFELINE CONFIGURATOR - CORE JS ENGINE
// Clean White Theme Edition: 3D Visualizer & Mechanical Calculator
// ==========================================

// Global Application State
const state = {
    lineLength: 15.0,     // Desired Lifeline Length L1 (m)
    spanMode: "standard", // Span mode ("standard" = automatic maxSpan, "custom" = user input span)
    customSpan: 5.0,      // User-entered Custom Span target (m)
    hasLine2: false,      // Secondary direction line flag
    line2Length: 10.0,    // Secondary Line Length L2 (m)
    edgeDistance: 3.0,    // Distance to edge Ed (m)
    roofHeight: 4.5,      // Building/Roof Slab height Ph (m)
    L: 21.0,              // Roof Length (m)
    l: 12.0,              // Roof Width (m)
    roofShape: "flat",    // Roof Shape ("flat", "sloped", "triangle")
    roofSlope: 0,         // Slope angle in degrees
    nbUsers: 1,           // Max Active Users (1 to 5)
    arrestForceLbf: 1350.0,// Input Arrest Force Limit (lbf, default 1350 lbf = 6.0 kN)
    fallFactor: 2,        // Fall Factor (Hidden, default 2)
    product: "NEW PRO",   // HOOKT Product Family ("NEW PRO", "LIGHT PRO", "LONG RANGE")
    norm: "OSHA",         // Regulatory Standard (100% OSHA)
    oshaSpanMode: "unique", // OSHA span mode: "unique" (2 anchors) or "multi" (4 anchors)
    viewMode: "3d",       // Camera View ("3d", "2d")
    roofTexture: "concrete",// Roof texture surface
    showObstacles: false, // Show skylights / obstacles flag
    showFallSim: true,    // 3D Fall Simulation & Callout overlay flag
    gridVisible: false,   // Grid visibility flag (disabled)
    lang: 0,              // Selected Language
    mountingType: "mini_omega", // Mounting type: "ground", "mini_omega", "rigide"
    checkedComponents: {
        "ground": false,
        "mini_omega": true,
        "rigide": false,
        "x_cone": false,
        "absorber": true
    },
    colors: {
        roof: "#cbd5e1",
        anchors: "#f8fafc",
        cable: "#f8fafc"
    }
};

// ==========================================
// OSHA MASS & TEST LOAD ENGINE
// ==========================================
const OSHA_MASS_TIERS = [
    { tier: 1, lbs: 1350, kn: 6.0, labelFr: "6,0 kN", labelEn: "1,350 lbf" },
    { tier: 2, lbs: 1660, kn: 7.4, labelFr: "7,4 kN", labelEn: "1,660 lbf" },
    { tier: 3, lbs: 1970, kn: 8.8, labelFr: "8,8 kN", labelEn: "1,970 lbf" },
    { tier: 4, lbs: 2280, kn: 10.1, labelFr: "10,1 kN", labelEn: "2,280 lbf" },
    { tier: 5, lbs: 2590, kn: 11.5, labelFr: "11,5 kN", labelEn: "2,590 lbf" }
];

function getOshaMassTierInfo(tier) {
    return OSHA_MASS_TIERS.find(t => t.tier === tier) || OSHA_MASS_TIERS[0];
}

function formatOshaMassDisplay(tier, lang = state.lang) {
    const info = getOshaMassTierInfo(tier);
    if (parseInt(lang) === 1) return info.labelEn;
    return info.labelFr;
}

// ==========================================
// UNIT CONVERSION ENGINE (METRIC <-> IMPERIAL INCHES)
// ==========================================
const METERS_TO_INCHES = 39.37007874;

function getDistanceUnit(lang = state.lang) {
    return (parseInt(lang) === 1) ? "in" : "m";
}

function convertDistance(meters, lang = state.lang) {
    if (parseInt(lang) === 1) {
        return meters * METERS_TO_INCHES;
    }
    return meters;
}

function formatDistance(meters, decimals = 2, lang = state.lang) {
    if (meters === null || meters === undefined || isNaN(meters)) {
        return `-- ${getDistanceUnit(lang)}`;
    }
    const val = convertDistance(meters, lang);
    const unit = getDistanceUnit(lang);
    return `${val.toFixed(decimals)} ${unit}`;
}

function formatDeflection(mm, lang = state.lang) {
    if (mm === null || mm === undefined || isNaN(mm)) {
        return (parseInt(lang) === 1) ? "-- in" : "-- mm";
    }
    if (parseInt(lang) === 1) {
        const inches = (mm / 1000.0) * METERS_TO_INCHES;
        return `${inches.toFixed(2)} in`;
    }
    const isOSHA = (state.norm === "OSHA");
    return isOSHA ? `${mm.toFixed(2)} mm` : `${Math.round(mm)} mm`;
}

function formatForce(kn, lang = state.lang) {
    if (kn === null || kn === undefined || isNaN(kn)) {
        return (parseInt(lang) === 1) ? "-- lbf" : "-- kN";
    }
    if (parseInt(lang) === 1) {
        const lbf = Math.round(kn * 224.809);
        return `${lbf.toLocaleString('en-US')} lbf`;
    }
    return `${kn.toFixed(2)} kN`;
}


function updateMassOptions() {
    const usersElem = document.getElementById("input-users");
    if (!usersElem) return;

    const shapeElem = document.getElementById("input-roof-shape");
    const currentShape = shapeElem ? shapeElem.value : state.roofShape;

    let maxUsers = 5;
    if (currentShape === "sloped") {
        maxUsers = 1;
    } else if (state.product === "LIGHT PRO" || state.product === "LONG RANGE" || state.product === "LightPro" || state.product === "LongRange") {
        maxUsers = 3;
    }

    if (state.nbUsers > maxUsers) {
        state.nbUsers = maxUsers;
    }

    const l = state.lang || 0;
    let html = "";
    for (let u = 1; u <= maxUsers; u++) {
        const selected = (u === state.nbUsers) ? "selected" : "";
        const uLabel = l === 1 ? (u === 1 ? "1 user" : `${u} users`) : (l === 2 ? (u === 1 ? "1 usuario" : `${u} usuarios`) : (u === 1 ? "1 utilisateur" : `${u} utilisateurs`));
        html += `<option value="${u}" ${selected}>${uLabel}</option>`;
    }

    usersElem.innerHTML = html;
    usersElem.value = state.nbUsers;
}

// ==========================================
// INTERNATIONALIZATION (i18n) ENGINE
// Languages: 0 = FR (Français), 1 = EN (English), 2 = ES (Español)
// ==========================================
const TRANSLATIONS = {
    brandBadge: ["SÉCURITÉ EN HAUTEUR", "HEIGHT SAFETY", "SEGURIDAD EN ALTURA"],
    homeSubtitle: [
        "Configurateur Intelligent de Lignes de Vie pour Toitures",
        "Smart Roof Lifeline Configurator",
        "Configurador Inteligente de Líneas de Vida para Cubiertas"
    ],
    homeDescription: [
        "Dimensionnez, visualisez en 3D/2D et éditez la note de conformité réglementaire OSHA (1910.140 / 1926.502) pour les systèmes HOOKT New Pro, Light Pro et Long/Super/Ultra Range.",
        "Size, visualize in 3D/2D and generate the regulatory compliance note OSHA (1910.140 / 1926.502) for HOOKT New Pro, Light Pro and Long/Super/Ultra Range systems.",
        "Dimensione, visualice en 3D/2D y genere la nota de conformidad normativa OSHA (1910.140 / 1926.502) para los sistemas HOOKT New Pro, Light Pro y Long/Super/Ultra Range."
    ],
    startBtnText: ["Démarrer une Configuration", "Start Configuration", "Iniciar Configuración"],

    modalTitle: ["Paramètres de la Toiture", "Roof Parameters", "Parámetros de la Cubierta"],
    lblShape: ["Forme / Typologie du Toit :", "Roof Shape / Typology:", "Forma / Tipología del Techo:"],
    roofShapes: {
        flat: ["Toit Plat (Terrasse Standard)", "Flat Roof (Standard Terrace)", "Techo Plano (Terraza Estándar)"],
        flat_overhead: ["Toit Plat (Overhead - Long/Super/Ultra Range uniquement)", "Flat Roof (Overhead - Long/Super/Ultra Range only)", "Techo Plano (Overhead - Solo Long/Super/Ultra Range)"],
        sloped: ["Toit Incliné (Monopente avec pente)", "Sloped Roof (Single pitch)", "Techo Inclinado (Monopassante)"],
        triangle: ["Toit Triangulaire (Pignon / Double Pente)", "Gabled / Triangular Roof", "Techo Triangular (A dos aguas)"]
    },
    lblSlope: ["Pente du toit :", "Roof Slope:", "Pendiente del techo:"],
    lblSpanMode: ["Mode de Portée :", "Span Mode:", "Modo de Luz:"],
    spanModes: {
        standard: ["Standard (Automatique)", "Standard (Automatic)", "Estándar (Automático)"],
        custom: ["Personnalisé (Saisie de portée)", "Custom (Manual span)", "Personalizado (Entrada de luz)"]
    },
    lblCustomSpan: ["Portée personnalisée :", "Custom Span:", "Luz Personalizada:"],
    lblLineLen: ["Longueur Ligne de Vie :", "Lifeline Length:", "Longitud Línea de Vida:"],
    lblUsers: ["Nombre d'utilisateurs :", "Number of Users:"],
    lblOshaMassReadout: ["Masse / Charge OSHA", "OSHA Mass / Load", "Masa / Carga OSHA"],
    lblChute: ["Facteur de chute :", "Fall Factor:", "Factor de Caída:"],
    fallFactors: {
        0: ["Facteur 0 (Restreint / Overhead)", "Factor 0 (Restrained / Overhead)", "Factor 0 (Restringido / Overhead)"],
        1: ["Facteur 1 (Standard)", "Factor 1 (Standard)", "Factor 1 (Estándar)"],
        2: ["Facteur 2 (Sévère)", "Factor 2 (Severe)", "Factor 2 (Severo)"]
    },
    lblHasLine2: ["Activer une seconde direction (Ligne 2)", "Enable a second direction (Line 2)", "Activar una segunda dirección (Línea 2)"],
    lblLine2Len: ["Longueur Ligne 2 :", "Line 2 Length:", "Longitud Línea 2:"],
    cancelBtn: ["Annuler", "Cancel", "Cancelar"],
    submitBtn: ["Valider et Générer 3D", "Validate & Generate 3D", "Validar y Generar 3D"],

    headerSubtitle: ["Ligne de Vie Configurator 3D", "Lifeline 3D Configurator", "Configurador 3D de Línea de Vida"],
    reconfigBtn: ["Dimensions", "Dimensions", "Dimensiones"],
    canvasTitle: ["Visualisation 3D / 2D", "3D / 2D Visualization", "Visualización 3D / 2D"],
    btnView3d: ["3D", "3D", "3D"],
    btnView2d: ["2D Dessus", "2D Top View", "2D Vista Superior"],
    camResetTitle: ["Réinitialiser la caméra", "Reset Camera", "Restablecer cámara"],
    gridToggleTitle: ["Masquer/Afficher Grille", "Toggle Grid", "Alternar cuadrícula"],
    fullscreenTitle: ["Plein écran", "Fullscreen", "Pantalla completa"],
    warningText: ["La portée réelle dépasse la portée autorisée !", "The actual span exceeds the allowed span!", "¡La luz real supera la luz permitida!"],
    legendRoof: ["Roof Surface", "Roof Surface", "Superficie del Techo"],
    legendAnchor: ["Potelets d'Ancrage", "Anchor Posts", "Postes de Anclaje"],
    legendCable: ["Câble de Ligne de Vie", "Lifeline Cable", "Cable de Línea de Vida"],

    groupTitlePieces: ["GAMME & COMPOSANTS HOOKT", "HOOKT RANGE & COMPONENTS", "GAMA Y COMPONENTES HOOKT"],
    sysNames: {
        longRange: ["LONG / SUPER / ULTRA RANGE", "LONG / SUPER / ULTRA RANGE", "LONG / SUPER / ULTRA RANGE"]
    },
    sysTags: {
        newPro: ["Max 15m", "Max 590.55 in"],
        lightPro: ["Max 15m", "Max 590.55 in"],
        longRange: ["Max 56m", "Max 2204.72 in"]
    },
    sysDescs: {
        newPro: ["Système haute performance avec absorbeurs intégrés pour bac acier et béton.", "High-performance system with integrated absorbers for trapezoidal sheet and concrete.", "Sistema de alto rendimiento con absorbedores integrados para chapa y hormigón."],
        lightPro: ["Solution légère et économique pour toitures tertiaires et industrielles.", "Lightweight and economical solution for commercial and industrial roofs.", "Solución ligera y económica para cubiertas comerciales e industriales."],
        longRange: ["Ligne de vie pour très grandes portées (Long Range 10-20m, Super Range 20-34m, Ultra Range 34-56m).", "Lifeline for long spans (Long Range 393.7-787.4 in, Super Range 787.4-1338.58 in, Ultra Range 1338.58-2204.72 in).", "Línea de vida para grandes luces (Long Range 10-20m, Super Range 20-34m, Ultra Range 34-56m)."]
    },
    lblComponentsSelector: ["PIÈCES DU SYSTÈME (COCHER POUR AFFICHER EN 3D) :", "SYSTEM COMPONENTS (CHECK TO DISPLAY IN 3D):", "PIEZAS DEL SISTEMA (MARCAR PARA MOSTRAR EN 3D):"],
    emptyStateTitle: ["Veuillez choisir un système HOOKT ci-dessus", "Please choose a HOOKT system above", "Por favor elija un sistema HOOKT arriba"],
    emptyStateSub: ["Cliquez sur NEW PRO, LIGHT PRO ou LONG / SUPER / ULTRA RANGE pour afficher et configurer la ligne de vie 3D.", "Click on NEW PRO, LIGHT PRO or LONG / SUPER / ULTRA RANGE to display and configure the 3D lifeline.", "Haga clic en NEW PRO, LIGHT PRO o LONG / SUPER / ULTRA RANGE para mostrar y configurar la línea de vida 3D."],

    components: {
        "New_Pro": ["NEW PRO ABSORBER", "NEW PRO ABSORBER", "ABSORBEDOR NEW PRO"],
        "X-Matrix": ["X-MATRIX JONCTION MULTIDIRECTIONNELLE", "X-MATRIX MULTIDIRECTIONAL JUNCTION", "UNIÓN MULTIDIRECCIONAL X-MATRIX"],
        "Mini_Omega": ["MINI OMEGA (avec NEW PRO)", "MINI OMEGA (with NEW PRO)", "MINI OMEGA (con NEW PRO)"],
        "P_Inox": ["POTELET INOX RIGIDE (avec NEW PRO)", "STAINLESS RIGID POST (with NEW PRO)", "POSTE INOX RÍGIDO (con NEW PRO)"],
        "X-Cone": ["X-CONE", "X-CONE", "X-CONE"],
        "LightPro": ["LIGHT PRO ABSORBER", "LIGHT PRO ABSORBER", "ABSORBEDOR LIGHT PRO"],
        "PB_HOOKt": ["POTELET PB HOOKT (avec LIGHT PRO)", "PB HOOKT POST (with LIGHT PRO)", "POSTE PB HOOKT (con LIGHT PRO)"],
        "P_Galva": ["POTELET GALVA RIGIDE (avec LIGHT PRO)", "GALVANIZED RIGID POST (with LIGHT PRO)", "POSTE GALVA RÍGIDO (con LIGHT PRO)"],
        "LongRange": ["LONG RANGE HEAVY ABSORBER", "LONG RANGE HEAVY ABSORBER", "ABSORBEDOR HEAVY LONG RANGE"],
        "A-Fix": ["A-FIX ANCHOR (avec LONG RANGE)", "A-FIX ANCHOR (with LONG RANGE)", "ANCLAJE A-FIX (con LONG RANGE)"]
    },

    nodeInspectorTitle: ["INSPECTEUR & ORIENTATION 3D", "INSPECTOR & 3D ORIENTATION", "INSPECTOR Y ORIENTACIÓN 3D"],
    lblNodeId: ["Potelet sélectionné :", "Selected Post:", "Poste Seleccionado:"],
    lblNodeCoords: ["Coordonnées (X, Z) :", "Coordinates (X, Z):", "Coordenadas (X, Z):"],
    lblNodeSpan: ["Distance au suivant :", "Distance to Next:", "Distancia al Siguiente:"],
    lblNodeRole: ["Rôle du Potelet :", "Post Role:", "Rol del Poste:"],
    nodeRoles: {
        extremite: ["Ancrage d'Extrémité (avec Absorbeur)", "End Anchor (with Absorber)", "Anclaje de Extremo (con Absorbedor)"],
        intermediaire: ["Potelet Intermédiaire", "Intermediate Post", "Poste Intermedio"],
        x_matrix: ["Platine X-MATRIX (Jonction Multi-Directionnelle)", "X-MATRIX Plate (Multi-Directional Junction)", "Placa X-MATRIX (Unión Multidireccional)"],
        angle: ["Potelet d'Angle", "Corner Post", "Poste de Esquina"]
    },
    lblNodeComp: ["Modèle 3D HOOKT Assigné :", "Assigned HOOKT 3D Model:", "Modelo 3D HOOKT Asignado:"],
    lblNodeRot: ["Orientation 3D :", "3D Orientation:", "Orientación 3D:"],
    btnAlignText: ["Aligner Câble", "Align Cable", "Alinear Cable"],
    btnDeleteText: ["Supprimer ce Potelet", "Delete this Post", "Eliminar este Poste"],

    groupTitleCalc: ["NOTE DE CALCUL DE CONFORMITÉ", "COMPLIANCE CALCULATION NOTE", "NOTA DE CÁLCULO DE CONFORMIDAD"],
    subtabSpanUnique: ["Portée Unique (2 ancrages)", "Single Span (2 anchors)", "Luz Única (2 anclajes)"],
    subtabSpanMulti: ["Multi-Portée (4 ancrages)", "Multi-Span (4 anchors)", "Multiluz (4 anclajes)"],
    lblAnchorCount: ["Potelets / Ancrages", "Posts / Anchors", "Postes / Anclajes"],
    lblAbsorberCount: ["Absorbeurs", "Absorbers", "Absorbedores"],
    lblFallFactorCalc: ["Facteur Chute :", "Fall Factor:", "Factor Caída:"],
    lblMaxAllowedSpanCalc: ["Portée Max Aut. :", "Max Allowed Span:", "Luz Máx. Perm.:"],
    sideTitleLifeline: ["Résultats sur la Ligne de Vie", "Lifeline Results", "Resultados de la Línea de Vida"],
    lblTotalLineLenRow: ["Longueur développée :", "Total Length:", "Longitud Total:"],
    lblSpanLRow: ["Portée réelle max :", "Max Actual Span:", "Luz Real Máxima:"],
    lblForceLRow: ["Effort longe :", "Lanyard Force:", "Esfuerzo del Elemento:"],
    lblDeflLRow: ["Flèche maximale :", "Max Deflection:", "Flecha Máxima:"],
    lblExt1LRow: ["Force Extrémité 1 :", "End Force 1:", "Fuerza Extremo 1:"],
    lblExt2LRow: ["Force Extrémité 2 :", "End Force 2:", "Fuerza Extremo 2:"],
    lblExt3LRow: ["Force Ancrage 3 :", "Anchor Force 3:", "Fuerza Anclaje 3:"],
    lblExt4LRow: ["Force Ancrage 4 :", "Anchor Force 4:", "Fuerza Anclaje 4:"],
    btnTextExport: ["Générer Rapport (PDF)", "Generate Report (PDF)", "Generar Informe (PDF)"],

    carouselTitle: ["Vue Éclatée", "Exploded View", "Vista Despiezada"],

    alerts: {
        xconeSloped: [
            "⚠️ CONFIGURATION INCOMPATIBLE :\nL'option X-CONE est utilisable uniquement en configuration toit mono-pente (incliné).",
            "⚠️ INCOMPATIBLE CONFIGURATION:\nThe X-CONE option can only be used on a single-slope (pitched) roof configuration.",
            "⚠️ CONFIGURACIÓN INCOMPATIBLE:\nLa opción X-CONE solo se puede utilizar en configuración de cubierta monopendiente (inclinada)."
        ],
        xconeSlopeRange: [
            "⚠️ CONFIGURATION INCOMPATIBLE :\nL'option X-CONE est utilisable uniquement pour une pente de toiture comprise entre 15° et 75°.",
            "⚠️ INCOMPATIBLE CONFIGURATION:\nThe X-CONE option can only be used for a roof slope between 15° and 75°.",
            "⚠️ CONFIGURACIÓN INCOMPATIBLE:\nLa opción X-CONE solo se puede utilizar para una pendiente de cubierta entre 15° y 75°."
        ],
        line2FlatOnly: [
            "⚠️ CONFIGURATION INCOMPATIBLE :\nLa seconde direction (Ligne 2) peut uniquement être sélectionnée en configuration Toit Plat (Terrasse Standard).",
            "⚠️ INCOMPATIBLE CONFIGURATION:\nThe second direction (Line 2) can only be selected in Flat Roof configuration (Standard Terrace).",
            "⚠️ CONFIGURACIÓN INCOMPATIBLE:\nLa segunda dirección (Línea 2) solo se puede seleccionar en configuración de Techo Plano (Terraza Estándar)."
        ],
        longRangeFlatOverhead: [
            "⚠️ CONFIGURATION INCOMPATIBLE :\nLe système LONG / SUPER / ULTRA RANGE est exclusivement utilisable en configuration Toit Plat (Overhead avec poteaux hauts).\nVotre toiture actuelle est configurée différemment. Veuillez modifier les paramètres de la toiture.",
            "⚠️ INCOMPATIBLE CONFIGURATION:\nThe LONG / SUPER / ULTRA RANGE system can only be used in Flat Roof configuration (Overhead with high posts).\nYour current roof is configured differently. Please modify roof parameters.",
            "⚠️ CONFIGURACIÓN INCOMPATIBLE:\nEl sistema LONG / SUPER / ULTRA RANGE solo se puede utilizar en configuración de Techo Plano (Overhead con postes altos).\nSu cubierta actual está configurada de forma diferente. Modifique los parámetros de la cubierta."
        ],
        overheadLongRangeOnly: [
            "⚠️ CONFIGURATION INCOMPATIBLE :\nLa configuration Toit Plat (Overhead avec poteaux hauts 3.0m) est exclusivement réservée au système LONG / SUPER / ULTRA RANGE.",
            "⚠️ INCOMPATIBLE CONFIGURATION:\nFlat Roof (Overhead with 3.0m high posts) is exclusively reserved for the LONG / SUPER / ULTRA RANGE system.",
            "⚠️ CONFIGURACIÓN INCOMPATIBLE:\nEl Techo Plano (Overhead con postes de 3,0 m) está reservado exclusivamente para el sistema LONG / SUPER / ULTRA RANGE."
        ],
        slopedNewProOnly: [
            "⚠️ CONFIGURATION INCOMPATIBLE :\nLe toit mono-pente (incliné) est uniquement disponible pour le système NEW PRO.",
            "⚠️ INCOMPATIBLE CONFIGURATION:\nSingle-slope (pitched) roof is only available for the NEW PRO system.",
            "⚠️ CONFIGURACIÓN INCOMPATIBLE:\nLa cubierta monopendiente (inclinada) solo está disponible para el sistema NEW PRO."
        ],
        usersLimit: [
            "⚠️ LIMITATION DU SYSTÈME :\nPour les systèmes LIGHT PRO et LONG RANGE, la charge maximale autorisée est de 1 970 lbs (8,8 kN).",
            "⚠️ SYSTEM LIMITATION:\nFor LIGHT PRO and LONG RANGE systems, maximum allowed load is 1,970 lbs (8.8 kN).",
            "⚠️ LIMITACIÓN DEL SISTEMA:\nPara los sistemas LIGHT PRO y LONG RANGE, la carga máxima permitida es de 1 970 lbs (8,8 kN)."
        ],
        miniOmegaNewPro: [
            "⚠️ ALERTE CONFIGURATION INVALIDE :\nLe potelet MINI OMEGA ne s'utilise qu'avec un ancrage NEWPRO (jamais seul, ni avec Light Pro ou Longue Portée).",
            "⚠️ INVALID CONFIGURATION ALERT:\nThe MINI OMEGA post is only used with a NEWPRO anchor (never alone, nor with Light Pro or Long Range).",
            "⚠️ ALERTA DE CONFIGURACIÓN INVÁLIDA:\nEl poste MINI OMEGA solo se utiliza con un anclaje NEWPRO (nunca solo, ni con Light Pro o Long Range)."
        ],
        basculantLightPro: [
            "⚠️ ALERTE CONFIGURATION INVALIDE :\nLe potelet basculant ne s'utilise qu'avec un ancrage Light Pro.",
            "⚠️ INVALID CONFIGURATION ALERT:\nThe tilting post is only used with a Light Pro anchor.",
            "⚠️ ALERTA DE CONFIGURACIÓN INVÁLIDA:\nEl poste basculante solo se utiliza con un anclaje Light Pro."
        ],
        rigideNotLongRange: [
            "⚠️ ALERTE CONFIGURATION INVALIDE :\nLe potelet rigide ne s'utilise qu'avec les gammes NEWPRO ou Light Pro.",
            "⚠️ INVALID CONFIGURATION ALERT:\nThe rigid post is only used with NEWPRO or Light Pro ranges.",
            "⚠️ ALERTA DE CONFIGURACIÓN INVÁLIDA:\nEl poste rígido solo se utiliza con las gamas NEWPRO o Light Pro."
        ],
        afixLongRangeOnly: [
            "⚠️ ALERTE CONFIGURATION INVALIDE :\nLa pièce A.FIX ne s'utilise qu'avec la gamme Longue Portée.",
            "⚠️ INVALID CONFIGURATION ALERT:\nThe A.FIX component is only used with the Long Range system.",
            "⚠️ ALERTA DE CONFIGURACIÓN INVÁLIDA:\nLa pieza A.FIX solo se utiliza con la gama Long Range."
        ],
        longRangeLengthRange: [
            "⚠️ LONGUEUR DE LIGNE NON CONFORME :\nPour le système LONG RANGE, vous devez choisir une longueur de ligne entre 10 et 56 m.",
            "⚠️ NON-COMPLIANT LINE LENGTH:\nFor the LONG RANGE system, line length must be between 393.7 and 2204.72 in.",
            "⚠️ LONGITUD DE LÍNEA NO CONFORME:\nPara el sistema LONG RANGE, la longitud de la línea debe estar entre 10 y 56 m."
        ],
        pdfLoading: [
            "Chargement du générateur PDF en cours... Veuillez réessayer dans un instant.",
            "PDF generator is loading... Please try again in a moment.",
            "Cargando el generador de PDF... Por favor inténtelo de nouveau en un momento."
        ]
    },

    pdf: {
        title: [
            "RAPPORT D'INSTALLATION & NOTE DE CALCUL LIGNE DE VIE",
            "INSTALLATION REPORT & LIFELINE CALCULATION NOTE",
            "INFORME DE INSTALACIÓN Y NOTA DE CÁLCULO DE LÍNEA DE VIDA"
        ],
        sec1Title: [
            "1. Synthèse de la Ligne de Vie HOOKT",
            "1. HOOKT Lifeline Overview",
            "1. Resumen de la Línea de Vida HOOKT"
        ],
        genDate: ["Date de génération : ", "Generation date: ", "Fecha de generación: "],
        productRange: ["Gamme de produit : ", "Product range: ", "Gama de producto: "],
        calcStandard: ["Norme de calcul : ", "Calculation standard: ", "Norma de cálculo: "],
        fallFactor: ["Facteur de chute : Facteur ", "Fall factor: Factor ", "Factor de caída: Factor "],
        anchorCount: ["Nombre d'ancrages (", "Number of anchors (", "Número de anclajes ("],
        absorberCount: ["Nombre d'absorbeurs (", "Number of absorbers (", "Número de absorbedores ("],
        mountingSupport: ["Support de pose : ", "Mounting surface: ", "Soporte de instalación: "],
        roofSlope: ["Pente de toiture : ", "Roof slope: ", "Pendiente de cubierta: "],
        linesSummary: ["Lignes : ", "Lines: ", "Líneas: "],
        lineLengthL1: ["Longueur Ligne (L1) : ", "Lifeline Length (L1): ", "Longitud Línea (L1): "],
        totalDevLength: ["Longueur totale développée : ", "Total developed length: ", "Longitud total desarrollada: "],
        maxUsers: ["Masse / Charge de calcul OSHA : ", "OSHA Mass / Test Load: ", "Masa / Carga de cálculo OSHA: "],
        
        concrete: ["Dalle Béton", "Concrete Slab", "Losa de Hormigón"],
        metal: ["Bac Acier Nervuré", "Trapezoidal Metal Sheet", "Chapa de Acero Nervada"],
        bitumen: ["Étanchéité Bitume", "Bitumen Membrane", "Impermeabilización Bituminosa"],
        metalOther: ["Structure Metal / Autre", "Steel Structure / Other", "Estructura Metálica / Otro"],

        flatRoofPdf: ["0° (Toit Plat)", "0° (Flat Roof)", "0° (Techo Plano)"],
        slopedRoofPdf: ["Toit Incliné", "Sloped Roof", "Techo Inclinado"],
        triangleRoofPdf: ["Toit Triangulaire", "Gabled Roof", "Techo Triangular"],

        midJuncPdf: ["Jonction X-Matrix", "X-Matrix Junction", "Unión X-Matrix"],
        endJuncPdf: ["Jonction Virage/Extrémité", "Corner/End Junction", "Unión Esquina/Extremo"],

        sec2Title: [
            "2. Résultats Mécaniques & Sollicitations",
            "2. Mechanical Results & Loads",
            "2. Resultados Mecánicos y Solicitaciones"
        ],
        table2Headers: [
            ["Indicateur Mécanique", "Valeur Calculée"],
            ["Mechanical Indicator", "Calculated Value"],
            ["Indicador Mecánico", "Valor Calculado"]
        ],
        rowMaxSpan: ["Portée réelle max", "Max real span", "Luz real máxima"],
        rowForceL: ["Effort longe (Fmax)", "Lanyard force (Fmax)", "Esfuerzo de elemento de amarre (Fmáx)"],
        rowDefl: ["Flèche maximale", "Max deflection", "Flecha máxima"],
        rowExt1: ["Force Extrémité 1", "End Force 1", "Fuerza Extremo 1"],
        rowExt2: ["Force Extrémité 2", "End Force 2", "Fuerza Extremo 2"],
        rowExt3: ["Force Ancrage 3", "Anchor Force 3", "Fuerza Anclaje 3"],
        rowExt4: ["Force Ancrage 4", "Anchor Force 4", "Fuerza Anclaje 4"],

        sec3Title: [
            "3. Nomenclatures des Composants & Fixations Préconisées",
            "3. Component Bill of Materials & Recommended Fasteners",
            "3. Nomenclatura de Componentes y Fijaciones Recomendadas"
        ],
        table3Headers: [
            ["Nom de la pièce", "Nombre de fixations", "Type de fixation"],
            ["Component Name", "Fastener Count", "Fastener Type"],
            ["Nombre de la pieza", "Número de fijaciones", "Tipo de fijación"]
        ],
        matriceNewPro: ["Matrice NEWPRO (Absorbeur)", "NEWPRO Matrix (Absorber)", "Matriz NEWPRO (Absorbedor)"],
        matriceLightPro: ["Matrice Light Pro (Absorbeur)", "Light Pro Matrix (Absorber)", "Matriz Light Pro (Absorbedor)"],
        matriceLongRange: ["Matrice Longue Portée", "Long Range Matrix", "Matriz Larga Distancia"],

        platineNewPro: ["Platine de fixation NEWPRO", "NEWPRO Mounting Plate", "Placa de fijación NEWPRO"],
        platineLightPro: ["Platine de fixation Light Pro", "Light Pro Mounting Plate", "Placa de fijación Light Pro"],
        platineLongRange: ["Platine de fixation Longue Portée", "Long Range Mounting Plate", "Placa de fijación Larga Distancia"],

        inoxBolts: ["Boulons Inox M12 x 30 + rondelles", "Stainless Bolts M12 x 30 + washers", "Pernos Inox M12 x 30 + arandelas"],
        noCompChecked: ["Aucun composant coché", "No component checked", "Ningún componente marcado"],

        referToManual: ["Se référer à la notice", "Refer to installation manual", "Consultar el manual"],

        footerRights: [
            "© {year} HOOKT. Tous droits réservés. — Protection et Sécurité en Hauteur",
            "© {year} HOOKT. All rights reserved. — Height Safety & Fall Protection",
            "© {year} HOOKT. Todos los derechos reservados. — Protección y Seguridad en Altura"
        ],
        footerContacts: [
            "Site Web : www.go-hookt.com   |   Email : contact@go-hookt.com   |   Tél : 05 59 52 40 48",
            "Website: www.go-hookt.com   |   Email: contact@go-hookt.com   |   Tel: +33 5 59 52 40 48",
            "Sitio web: www.go-hookt.com   |   Email: contact@go-hookt.com   |   Tel: +33 5 59 52 40 48"
        ],
        pageStr: ["Page", "Page", "Página"]
    }
};

function getLongRangeSubRange(lineLen) {
    const len = lineLen !== undefined ? lineLen : (state.lineLength || 15);
    if (len < 20.0) return "LONG RANGE";
    if (len < 34.0) return "SUPER RANGE";
    return "ULTRA RANGE";
}

function getComponentName(c) {
    if (!c) return "";
    const l = state.lang || 0;
    if (c.id === "LongRange" || c.id === "Long_Range") {
        const sub = getLongRangeSubRange(state.lineLength);
        if (sub === "LONG RANGE") {
            return ["ABSORBEUR LONG RANGE", "LONG RANGE HEAVY ABSORBER", "ABSORBEDOR LONG RANGE"][l];
        } else if (sub === "SUPER RANGE") {
            return ["ABSORBEUR SUPER RANGE", "SUPER RANGE HEAVY ABSORBER", "ABSORBEDOR SUPER RANGE"][l];
        } else {
            return ["ABSORBEUR ULTRA RANGE", "ULTRA RANGE HEAVY ABSORBER", "ABSORBEDOR ULTRA RANGE"][l];
        }
    }
    if (c.id === "A-Fix" || c.id === "A_Fix") {
        return ["ANCRAGE A-FIX", "A-FIX ANCHOR", "ANCLAJE A-FIX"][l];
    }
    if (c.id === "PB_HOOKt" || c.id === "PB_HOOKT") {
        const sysName = state.product || "NEW PRO";
        return [
            `POTELET PB HOOKT (avec ${sysName})`,
            `PB HOOKT POST (with ${sysName})`,
            `POSTE PB HOOKT (con ${sysName})`
        ][l];
    }
    if (c.id === "P_Galva") {
        const sysName = state.product || "NEW PRO";
        return [
            `POTELET GALVA RIGIDE (avec ${sysName})`,
            `GALVANIZED RIGID POST (with ${sysName})`,
            `POSTE GALVA RÍGIDO (con ${sysName})`
        ][l];
    }
    if (c.id === "P_Inox") {
        const sysName = state.product || "NEW PRO";
        return [
            `POTELET INOX RIGIDE (avec ${sysName})`,
            `STAINLESS RIGID POST (with ${sysName})`,
            `POSTE INOX RÍGIDO (con ${sysName})`
        ][l];
    }
    if (TRANSLATIONS.components[c.id]) {
        return TRANSLATIONS.components[c.id][l];
    }
    return c.name;
}

function applyLanguage(langIndex) {
    state.lang = (parseInt(langIndex) === 1) ? 1 : 0;
    const l = state.lang;

    const selectHome = document.getElementById("lang-select-home");
    const selectDb = document.getElementById("lang-select-db");
    if (selectHome && selectHome.value != l) selectHome.value = l;
    if (selectDb && selectDb.value != l) selectDb.value = l;

    const homeBadge = document.getElementById("home-brand-badge");
    if (homeBadge) {
        const span = homeBadge.querySelector("span");
        if (span) span.textContent = TRANSLATIONS.brandBadge[l];
    }
    const homeSub = document.getElementById("home-subtitle");
    if (homeSub) homeSub.textContent = TRANSLATIONS.homeSubtitle[l];
    const homeDesc = document.getElementById("home-description");
    if (homeDesc) homeDesc.textContent = TRANSLATIONS.homeDescription[l];
    const startBtnText = document.getElementById("start-btn-text");
    if (startBtnText) startBtnText.textContent = TRANSLATIONS.startBtnText[l];

    const modalTitle = document.getElementById("config-modal-title");
    if (modalTitle) modalTitle.textContent = TRANSLATIONS.modalTitle[l];
    const lblShape = document.getElementById("lbl-shape");
    if (lblShape) lblShape.textContent = TRANSLATIONS.lblShape[l];

    const inputRoofShape = document.getElementById("input-roof-shape");
    if (inputRoofShape) {
        Array.from(inputRoofShape.options).forEach(opt => {
            if (TRANSLATIONS.roofShapes[opt.value]) {
                opt.textContent = TRANSLATIONS.roofShapes[opt.value][l];
            }
        });
    }

    const lblSlope = document.getElementById("lbl-slope");
    if (lblSlope) lblSlope.textContent = TRANSLATIONS.lblSlope[l];

    const lblSpanMode = document.getElementById("lbl-span-mode");
    if (lblSpanMode) lblSpanMode.textContent = TRANSLATIONS.lblSpanMode[l];

    const inputSpanMode = document.getElementById("input-span-mode");
    if (inputSpanMode) {
        Array.from(inputSpanMode.options).forEach(opt => {
            if (TRANSLATIONS.spanModes[opt.value]) {
                opt.textContent = TRANSLATIONS.spanModes[opt.value][l];
            }
        });
    }

    const lblCustomSpan = document.getElementById("lbl-custom-span");
    if (lblCustomSpan) lblCustomSpan.textContent = TRANSLATIONS.lblCustomSpan[l];

    const unitCustomSpan = document.getElementById("unit-custom-span");
    if (unitCustomSpan) unitCustomSpan.textContent = (l === 1) ? "in" : "m";

    const unitWorkerForce = document.getElementById("unit-worker-force");
    if (unitWorkerForce) unitWorkerForce.textContent = (l === 1) ? "lbf" : "kN";

    const forceInput = document.getElementById("input-worker-force") || document.getElementById("input-worker-mass");
    if (forceInput) {
        forceInput.min = (l === 1) ? "500" : "2.0";
        forceInput.max = (l === 1) ? "5000" : "25.0";
        forceInput.step = (l === 1) ? "1" : "0.1";
    }

    const lblLineLen = document.getElementById("lbl-line-len");
    if (lblLineLen) lblLineLen.textContent = TRANSLATIONS.lblLineLen[l];
    const lblUsers = document.getElementById("lbl-users");
    if (lblUsers) lblUsers.textContent = TRANSLATIONS.lblUsers[l];

    const lblHasLine2Span = document.getElementById("lbl-has-line2-span");
    if (lblHasLine2Span) {
        lblHasLine2Span.innerHTML = `<i class="fa-solid fa-code-fork"></i> ${TRANSLATIONS.lblHasLine2[l]}`;
    }
    const lblLine2Len = document.getElementById("lbl-line2-len");
    if (lblLine2Len) lblLine2Len.textContent = TRANSLATIONS.lblLine2Len[l];

    const cancelBtn = document.getElementById("config-cancel-btn");
    if (cancelBtn) cancelBtn.textContent = TRANSLATIONS.cancelBtn[l];
    const submitBtn = document.getElementById("config-submit-btn");
    if (submitBtn) {
        const icon = submitBtn.querySelector("i");
        submitBtn.innerHTML = `${icon ? icon.outerHTML : '<i class="fa-solid fa-check"></i>'} ${TRANSLATIONS.submitBtn[l]}`;
    }

    const appHeaderSub = document.getElementById("app-header-subtitle");
    if (appHeaderSub) appHeaderSub.textContent = TRANSLATIONS.headerSubtitle[l];
    const reconfigBtnText = document.getElementById("reconfig-btn-text");
    if (reconfigBtnText) reconfigBtnText.textContent = TRANSLATIONS.reconfigBtn[l];
    const canvasTitleText = document.getElementById("canvas-title-text");
    if (canvasTitleText) canvasTitleText.textContent = TRANSLATIONS.canvasTitle[l];
    const btnView3dText = document.getElementById("btn-view-3d-text");
    if (btnView3dText) btnView3dText.textContent = TRANSLATIONS.btnView3d[l];
    const btnView2dText = document.getElementById("btn-view-2d-text");
    if (btnView2dText) btnView2dText.textContent = TRANSLATIONS.btnView2d[l];
    const warningText = document.getElementById("warning-text");
    if (warningText) warningText.textContent = TRANSLATIONS.warningText[l];
    const legendRoof = document.getElementById("legend-roof");
    if (legendRoof) legendRoof.textContent = TRANSLATIONS.legendRoof[l];
    const legendAnchor = document.getElementById("legend-anchor");
    if (legendAnchor) legendAnchor.textContent = TRANSLATIONS.legendAnchor[l];
    const legendCable = document.getElementById("legend-cable");
    if (legendCable) legendCable.textContent = TRANSLATIONS.legendCable[l];

    const groupTitlePieces = document.getElementById("group-title-pieces");
    if (groupTitlePieces) groupTitlePieces.textContent = TRANSLATIONS.groupTitlePieces[l];

    const sysTagNewPro = document.getElementById("sys-tag-newpro");
    if (sysTagNewPro) sysTagNewPro.textContent = TRANSLATIONS.sysTags.newPro[l];
    const sysDescNewPro = document.getElementById("sys-desc-newpro");
    if (sysDescNewPro) sysDescNewPro.textContent = TRANSLATIONS.sysDescs.newPro[l];

    const sysTagLightPro = document.getElementById("sys-tag-lightpro");
    if (sysTagLightPro) sysTagLightPro.textContent = TRANSLATIONS.sysTags.lightPro[l];
    const sysDescLightPro = document.getElementById("sys-desc-lightpro");
    if (sysDescLightPro) sysDescLightPro.textContent = TRANSLATIONS.sysDescs.lightPro[l];

    const sysNameLongRange = document.getElementById("sys-name-longrange");
    if (sysNameLongRange) sysNameLongRange.textContent = TRANSLATIONS.sysNames.longRange[l];
    const sysTagLongRange = document.getElementById("sys-tag-longrange");
    if (sysTagLongRange) sysTagLongRange.textContent = TRANSLATIONS.sysTags.longRange[l];
    const sysDescLongRange = document.getElementById("sys-desc-longrange");
    if (sysDescLongRange) sysDescLongRange.textContent = TRANSLATIONS.sysDescs.longRange[l];

    const lblCompSel = document.getElementById("lbl-components-selector");
    if (lblCompSel) {
        lblCompSel.innerHTML = `<i class="fa-solid fa-square-check"></i> ${TRANSLATIONS.lblComponentsSelector[l]}`;
    }

    const nodeInspTitle = document.getElementById("node-inspector-title");
    if (nodeInspTitle) nodeInspTitle.textContent = TRANSLATIONS.nodeInspectorTitle[l];
    const lblNodeId = document.getElementById("lbl-node-id");
    if (lblNodeId) lblNodeId.textContent = TRANSLATIONS.lblNodeId[l];
    const lblNodeCoords = document.getElementById("lbl-node-coords");
    if (lblNodeCoords) lblNodeCoords.textContent = TRANSLATIONS.lblNodeCoords[l];
    const lblNodeSpan = document.getElementById("lbl-node-span");
    if (lblNodeSpan) lblNodeSpan.textContent = TRANSLATIONS.lblNodeSpan[l];
    const lblNodeRole = document.getElementById("lbl-node-role");
    if (lblNodeRole) lblNodeRole.textContent = TRANSLATIONS.lblNodeRole[l];

    const nodeTypeSelect = document.getElementById("node-type-select");
    if (nodeTypeSelect) {
        Array.from(nodeTypeSelect.options).forEach(opt => {
            if (TRANSLATIONS.nodeRoles[opt.value]) {
                opt.textContent = TRANSLATIONS.nodeRoles[opt.value][l];
            }
        });
    }

    const lblNodeComp = document.getElementById("lbl-node-comp");
    if (lblNodeComp) lblNodeComp.textContent = TRANSLATIONS.lblNodeComp[l];
    const lblNodeRotText = document.getElementById("lbl-node-rot-text");
    if (lblNodeRotText) lblNodeRotText.textContent = TRANSLATIONS.lblNodeRot[l];
    const btnAlignText = document.getElementById("btn-align-text");
    if (btnAlignText) btnAlignText.textContent = TRANSLATIONS.btnAlignText[l];
    const btnDeleteText = document.getElementById("btn-delete-text");
    if (btnDeleteText) btnDeleteText.textContent = TRANSLATIONS.btnDeleteText[l];

    const groupTitleCalc = document.getElementById("group-title-calc");
    if (groupTitleCalc) groupTitleCalc.textContent = TRANSLATIONS.groupTitleCalc[l];
    const subtabSpanUnique = document.getElementById("subtab-span-unique");
    if (subtabSpanUnique) subtabSpanUnique.textContent = TRANSLATIONS.subtabSpanUnique[l];
    const subtabSpanMulti = document.getElementById("subtab-span-multi");
    if (subtabSpanMulti) subtabSpanMulti.textContent = TRANSLATIONS.subtabSpanMulti[l];

    const lblAnchorCount = document.getElementById("lbl-anchor-count");
    if (lblAnchorCount) lblAnchorCount.textContent = TRANSLATIONS.lblAnchorCount[l];
    const lblAbsorberCount = document.getElementById("lbl-absorber-count");
    if (lblAbsorberCount) lblAbsorberCount.textContent = TRANSLATIONS.lblAbsorberCount[l];
    const lblOshaMassReadout = document.getElementById("lbl-osha-mass-readout");
    if (lblOshaMassReadout && TRANSLATIONS.lblOshaMassReadout) lblOshaMassReadout.textContent = TRANSLATIONS.lblOshaMassReadout[l];
    const lblFallFactorCalc = document.getElementById("lbl-fall-factor-calc");
    if (lblFallFactorCalc) lblFallFactorCalc.textContent = TRANSLATIONS.lblFallFactorCalc[l];
    const lblMaxAllowedSpanCalc = document.getElementById("lbl-max-allowed-span-calc");
    if (lblMaxAllowedSpanCalc) lblMaxAllowedSpanCalc.textContent = TRANSLATIONS.lblMaxAllowedSpanCalc[l];

    const sideTitleLifelineText = document.getElementById("side-title-lifeline-text");
    if (sideTitleLifelineText) sideTitleLifelineText.textContent = TRANSLATIONS.sideTitleLifeline[l];

    const lblTotalLineLenRow = document.getElementById("lbl-total-line-len-row");
    if (lblTotalLineLenRow) lblTotalLineLenRow.textContent = TRANSLATIONS.lblTotalLineLenRow[l];
    const lblSpanLRow = document.getElementById("lbl-span-l-row");
    if (lblSpanLRow) lblSpanLRow.textContent = TRANSLATIONS.lblSpanLRow[l];
    const lblForceLRow = document.getElementById("lbl-force-l-row");
    if (lblForceLRow) lblForceLRow.textContent = TRANSLATIONS.lblForceLRow[l];
    const lblDeflLRow = document.getElementById("lbl-defl-l-row");
    if (lblDeflLRow) lblDeflLRow.textContent = TRANSLATIONS.lblDeflLRow[l];
    const lblExt1LRow = document.getElementById("lbl-ext1-l-row");
    if (lblExt1LRow) lblExt1LRow.textContent = TRANSLATIONS.lblExt1LRow[l];
    const lblExt2LRow = document.getElementById("lbl-ext2-l-row");
    if (lblExt2LRow) lblExt2LRow.textContent = TRANSLATIONS.lblExt2LRow[l];
    const lblExt3LRow = document.getElementById("lbl-ext3-l-row");
    if (lblExt3LRow) lblExt3LRow.textContent = TRANSLATIONS.lblExt3LRow[l];
    const lblExt4LRow = document.getElementById("lbl-ext4-l-row");
    if (lblExt4LRow) lblExt4LRow.textContent = TRANSLATIONS.lblExt4LRow[l];

    const btnTextExport = document.getElementById("btn-text-export");
    if (btnTextExport) btnTextExport.textContent = TRANSLATIONS.btnTextExport[l];

    const carouselTitle = document.getElementById("carousel-title");
    if (carouselTitle) carouselTitle.textContent = TRANSLATIONS.carouselTitle[l];

    const unitLineLen = document.getElementById("unit-line-len");
    if (unitLineLen) unitLineLen.textContent = (l === 1) ? "in" : "m";
    const unitLine2Len = document.getElementById("unit-line2-len");
    if (unitLine2Len) unitLine2Len.textContent = (l === 1) ? "in" : "m";
    populateConfigModalInputs();

    renderComponentsChecklist();
    if (typeof update3DScene === "function" && state.product) {
        update3DScene();
    } else if (state.product) {
        const activePositions = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
        updateCalculationsUI(activePositions, Calculator.getMaxSpan(state.product));
    }
}

// Real 3D Component Models Database & Exploded Views
const COMPONENTS_DB = {
    "NEW PRO": [
        { id: "New_Pro", name: "NEW PRO ABSORBER", file: "models/new_pro/New_Pro.glb", checked: true, exploded: ["models/new_pro/New_Pro_exploded1.png", "models/new_pro/New_Pro_exploded2.png", "models/new_pro/New_Pro_exploded3.png"] },
        { id: "Mini_Omega", name: "MINI OMEGA (avec NEW PRO)", file: "models/new_pro/Mini_Omega.glb", checked: false, exploded: ["models/new_pro/Mini_Omega_exploded1.png", "models/new_pro/Mini_Omega_exploded2.png", "models/new_pro/Mini_Omega_exploded3.png"] },
        { id: "PB_HOOKt", name: "POTELET PB HOOKT (avec NEW PRO)", file: "models/new_pro/PB_HOOKT.glb", checked: false, exploded: ["models/new_pro/PB_HOOKT_exploded1.png", "models/new_pro/PB_HOOKT_exploded2.png", "models/new_pro/PB_HOOKT_exploded3.png"] },
        { id: "P_Galva", name: "POTELET GALVA RIGIDE (avec NEW PRO)", file: "models/new_pro/P_Glava_Rigide.glb", checked: false, exploded: ["models/new_pro/P_Galva_Rigide_exploded1.png", "models/new_pro/P_Galva_Rigide_exploded2.png", "models/new_pro/P_Galva_Rigide_exploded3.png"] },
        { id: "P_Inox", name: "POTELET INOX RIGIDE (avec NEW PRO)", file: "models/new_pro/P_Inox_Rigide.glb", checked: false, exploded: ["models/new_pro/P_Inox_Rigide_exploded1.png", "models/new_pro/P_Inox_Rigide_exploded2.png", "models/new_pro/P_Inox_Rigide_exploded3.png"] },
        { id: "X-Cone", name: "X-CONE", file: "models/new_pro/X-Cone.glb", checked: false, exploded: ["models/new_pro/X-Cone_exploded1.png", "models/new_pro/X-Cone_exploded3.png"] }
    ],
    "LIGHT PRO": [
        { id: "LightPro", name: "LIGHT PRO ABSORBER", file: "models/light_pro/LightPro.glb", checked: true, exploded: ["models/light_pro/LightPro_exploded1.png", "models/light_pro/LightPro_exploded2.png", "models/light_pro/LightPro_exploded3.png"] },
        { id: "PB_HOOKt", name: "POTELET PB HOOKT (avec LIGHT PRO)", file: "models/light_pro/PB_HOOKT.glb", checked: false, exploded: ["models/light_pro/PB_HOOKT_exploded1.png", "models/light_pro/PB_HOOKT_exploded2.png", "models/light_pro/PB_HOOKT_exploded3.png"] },
        { id: "P_Galva", name: "POTELET GALVA RIGIDE (avec LIGHT PRO)", file: "models/light_pro/P_Galva_Rigide.glb", checked: false, exploded: ["models/light_pro/P_Galva_Rigide_exploded1.png", "models/light_pro/P_Galva_Rigide_exploded2.png", "models/light_pro/P_Galva_Rigide_exploded3.png"] },
        { id: "P_Inox", name: "POTELET INOX RIGIDE (avec LIGHT PRO)", file: "models/light_pro/P_Inox_Rigide.glb", checked: false, exploded: ["models/light_pro/P_Inox_Rigide_exploded1.png", "models/light_pro/P_Inox_Rigide_exploded2.png", "models/light_pro/P_Inox_Rigide_exploded3.png"] }
    ],
    "LONG RANGE": [
        { id: "LongRange", name: "LONG RANGE HEAVY ABSORBER", file: "models/long_range/LongRange.glb", checked: true, exploded: ["models/long_range/LongRange_exploded1.png", "models/long_range/LongRange_exploded2.png", "models/long_range/LongRange_exploded3.png"] },
        { id: "A-Fix", name: "A-FIX ANCHOR", file: "models/long_range/LongRange.glb", checked: true, exploded: ["models/long_range/A-Fix_exploded1.png", "models/long_range/A-Fix_exploded2.png"] }
    ]
};

// 3D Models Cache & Loaders (GLTF / GLB primary with OBJ fallback)
const objCache = {};
const gltfLoader = typeof THREE !== "undefined" && THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
const objLoader = typeof THREE !== "undefined" && THREE.OBJLoader ? new THREE.OBJLoader() : null;

function loadOBJModel(filePath) {
    if (objCache[filePath]) {
        return Promise.resolve(objCache[filePath]);
    }
    return new Promise((resolve) => {
        const isGLTF = filePath.endsWith(".glb") || filePath.endsWith(".gltf");
        if (isGLTF && gltfLoader) {
            gltfLoader.load(
                filePath,
                (gltf) => {
                    objCache[filePath] = gltf.scene;
                    resolve(gltf.scene);
                },
                undefined,
                (err) => {
                    console.warn("Failed to load GLTF model:", filePath, err);
                    resolve(null);
                }
            );
        } else if (objLoader) {
            objLoader.load(
                filePath,
                (object) => {
                    objCache[filePath] = object;
                    resolve(object);
                },
                undefined,
                (err) => {
                    console.warn("Failed to load OBJ model:", filePath, err);
                    resolve(null);
                }
            );
        } else {
            resolve(null);
        }
    });
}

function preloadActiveModels() {
    const list = COMPONENTS_DB[state.product] || [];
    const files = list.map(c => c.file).filter(Boolean);
    const uniqueFiles = [...new Set(files)];
    const promises = uniqueFiles.map(f => loadOBJModel(f));

    Promise.all(promises).then(() => {
        if (typeof update3DScene === "function") update3DScene();
    });
}

// ==========================================
// ==========================================
// MODULE : SLOPED LIFELINE SYSTEM (CÔNES)
// Matrice d'essais réels (42 essais) & Moteur d'extrapolation
// ==========================================
const SlopedSystemConesModule = {
    // 42 Enregistrements d'essais réels (Source: TEST MATRIX - Sloped System)
    rawTestData: [
        { testId: "VP1.1", scenario: "Sliding", repetition: false, massKg: 50, initialAngleDeg: 15, finalAngleDeg: 37.95, loadCellTopKn: 1.861, loadCellBottomKn: 1.408, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP1.2", scenario: "Sliding", repetition: true, massKg: 50, initialAngleDeg: 15, finalAngleDeg: 31.4, loadCellTopKn: 1.883, loadCellBottomKn: 1.102, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP1.3", scenario: "Sliding", repetition: false, massKg: 141, initialAngleDeg: 15, finalAngleDeg: 53.25, loadCellTopKn: 4.859, loadCellBottomKn: 2.553, cones: [{ index: 1, slipMm: 7.32 }] },
        { testId: "VP1.4", scenario: "Sliding", repetition: true, massKg: 141, initialAngleDeg: 15, finalAngleDeg: 52.4, loadCellTopKn: 5.324, loadCellBottomKn: 2.237, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP1.5", scenario: "Free Fall", repetition: false, massKg: 50, initialAngleDeg: 15, finalAngleDeg: 38.25, loadCellTopKn: 2.418, loadCellBottomKn: 1.599, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP1.6", scenario: "Free Fall", repetition: true, massKg: 50, initialAngleDeg: 15, finalAngleDeg: 38.85, loadCellTopKn: 2.162, loadCellBottomKn: 1.825, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP1.7", scenario: "Free Fall", repetition: false, massKg: 141, initialAngleDeg: 15, finalAngleDeg: 62.35, loadCellTopKn: 3.886, loadCellBottomKn: 1.955, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP1.8", scenario: "Free Fall", repetition: true, massKg: 141, initialAngleDeg: 15, finalAngleDeg: 59.9, loadCellTopKn: 4.433, loadCellBottomKn: 2.529, cones: [{ index: 1, slipMm: 1 }] },

        { testId: "VP2.1", scenario: "Sliding", repetition: false, massKg: 50, initialAngleDeg: 30, finalAngleDeg: 42.7, loadCellTopKn: 4.038, loadCellBottomKn: 2.424, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP2.2", scenario: "Sliding", repetition: true, massKg: 50, initialAngleDeg: 30, finalAngleDeg: 41.75, loadCellTopKn: 4.201, loadCellBottomKn: 2.19, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP2.3", scenario: "Sliding", repetition: false, massKg: 141, initialAngleDeg: 30, finalAngleDeg: 54.15, loadCellTopKn: null, loadCellBottomKn: 3.206, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP2.4", scenario: "Sliding", repetition: true, massKg: 141, initialAngleDeg: 30, finalAngleDeg: 62.1, loadCellTopKn: 5.63, loadCellBottomKn: 1.751, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP2.5", scenario: "Free Fall", repetition: false, massKg: 50, initialAngleDeg: 30, finalAngleDeg: 42.6, loadCellTopKn: 3.298, loadCellBottomKn: 2.812, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP2.6", scenario: "Free Fall", repetition: true, massKg: 50, initialAngleDeg: 30, finalAngleDeg: 42.2, loadCellTopKn: 3.976, loadCellBottomKn: 3.034, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP2.7", scenario: "Free Fall", repetition: false, massKg: 141, initialAngleDeg: 30, finalAngleDeg: 53.3, loadCellTopKn: 7.074, loadCellBottomKn: 2.641, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP2.8", scenario: "Free Fall", repetition: true, massKg: 141, initialAngleDeg: 30, finalAngleDeg: 54.16, loadCellTopKn: 6.307, loadCellBottomKn: 3.76, cones: [{ index: 1, slipMm: 1 }] },

        { testId: "VP3.1", scenario: "Sliding", repetition: false, massKg: 50, initialAngleDeg: 45, finalAngleDeg: 54.3, loadCellTopKn: 3.704, loadCellBottomKn: 1.591, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP3.2", scenario: "Sliding", repetition: true, massKg: 50, initialAngleDeg: 45, finalAngleDeg: 55.1, loadCellTopKn: 3.646, loadCellBottomKn: 1.523, cones: [{ index: 1, slipMm: 2 }] },
        { testId: "VP3.3", scenario: "Sliding", repetition: false, massKg: 141, initialAngleDeg: 45, finalAngleDeg: 60.95, loadCellTopKn: 9.931, loadCellBottomKn: 4.451, cones: [{ index: 1, slipMm: 2 }] },
        { testId: "VP3.4", scenario: "Sliding", repetition: true, massKg: 141, initialAngleDeg: 45, finalAngleDeg: 66.95, loadCellTopKn: 9.232, loadCellBottomKn: 6.856, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP3.5", scenario: "Free Fall", repetition: false, massKg: 50, initialAngleDeg: 45, finalAngleDeg: 57.8, loadCellTopKn: 4.133, loadCellBottomKn: 3.147, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP3.6", scenario: "Free Fall", repetition: true, massKg: 50, initialAngleDeg: 45, finalAngleDeg: 56.9, loadCellTopKn: 3.411, loadCellBottomKn: 2.599, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP3.7", scenario: "Free Fall", repetition: false, massKg: 141, initialAngleDeg: 45, finalAngleDeg: 57.95, loadCellTopKn: 12.323, loadCellBottomKn: 5.084, cones: [{ index: 1, slipMm: 1.67 }] },
        { testId: "VP3.8", scenario: "Free Fall", repetition: true, massKg: 141, initialAngleDeg: 45, finalAngleDeg: 58.95, loadCellTopKn: 11.265, loadCellBottomKn: 5.431, cones: [{ index: 1, slipMm: 3.48 }] },

        { testId: "VP4.1", scenario: "Sliding", repetition: false, massKg: 50, initialAngleDeg: 60, finalAngleDeg: 69.8, loadCellTopKn: 6.039, loadCellBottomKn: 3.135, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP4.2", scenario: "Sliding", repetition: true, massKg: 50, initialAngleDeg: 60, finalAngleDeg: 72.7, loadCellTopKn: 5.874, loadCellBottomKn: 2.893, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP4.3", scenario: "Sliding", repetition: false, massKg: 141, initialAngleDeg: 60, finalAngleDeg: 78.05, loadCellTopKn: 10.54, loadCellBottomKn: 3.013, cones: [{ index: 1, slipMm: 2.62 }] },
        { testId: "VP4.4", scenario: "Sliding", repetition: true, massKg: 141, initialAngleDeg: 60, finalAngleDeg: 79.8, loadCellTopKn: 9.48, loadCellBottomKn: 3.114, cones: [{ index: 1, slipMm: 3.99 }] },
        { testId: "VP4.5", scenario: "Free Fall", repetition: false, massKg: 50, initialAngleDeg: 60, finalAngleDeg: 80.15, loadCellTopKn: 4.573, loadCellBottomKn: null, cones: [{ index: 1, slipMm: 39.67 }] },
        { testId: "VP4.6", scenario: "Free Fall", repetition: true, massKg: 50, initialAngleDeg: 60, finalAngleDeg: 73.9, loadCellTopKn: 7.211, loadCellBottomKn: 3.171, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP4.7", scenario: "Free Fall", repetition: false, massKg: 141, initialAngleDeg: 60, finalAngleDeg: 78.95, loadCellTopKn: 11.752, loadCellBottomKn: 3.088, cones: [{ index: 1, slipMm: 28.95 }] },
        { testId: "VP4.8", scenario: "Free Fall", repetition: true, massKg: 141, initialAngleDeg: 60, finalAngleDeg: 82.05, loadCellTopKn: 14.108, loadCellBottomKn: 3.677, cones: [{ index: 1, slipMm: 37.1 }] },
        { testId: "Extra_60", scenario: "Free Fall", repetition: true, massKg: 50, initialAngleDeg: 60, finalAngleDeg: 61.6, loadCellTopKn: 7.39, loadCellBottomKn: 3.1, cones: [{ index: 1, slipMm: 1 }] },

        { testId: "VP5.1", scenario: "Sliding", repetition: false, massKg: 50, initialAngleDeg: 75, finalAngleDeg: 82.3, loadCellTopKn: 9.687, loadCellBottomKn: 4.218, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP5.2", scenario: "Sliding", repetition: true, massKg: 50, initialAngleDeg: 75, finalAngleDeg: 86.2, loadCellTopKn: 8.91, loadCellBottomKn: 3.344, cones: [{ index: 1, slipMm: 1 }] },
        { testId: "VP5.3", scenario: "Sliding", repetition: false, massKg: 141, initialAngleDeg: 75, finalAngleDeg: 88.25, loadCellTopKn: 12.016, loadCellBottomKn: 3.386, cones: [{ index: 1, slipMm: 51.12 }] },
        { testId: "VP5.4", scenario: "Sliding", repetition: true, massKg: 141, initialAngleDeg: 75, finalAngleDeg: 84.55, loadCellTopKn: 14.571, loadCellBottomKn: 3.763, cones: [{ index: 1, slipMm: 35.19 }] },
        { testId: "VP5.5", scenario: "Free Fall", repetition: false, massKg: 50, initialAngleDeg: 75, finalAngleDeg: 81.6, loadCellTopKn: 5.896, loadCellBottomKn: 1.508, cones: [{ index: 1, slipMm: 30.05 }] },
        { testId: "VP5.6", scenario: "Free Fall", repetition: true, massKg: 50, initialAngleDeg: 75, finalAngleDeg: 81.4, loadCellTopKn: 6.519, loadCellBottomKn: 1.687, cones: [{ index: 1, slipMm: 13.78 }] },
        { testId: "VP5.7", scenario: "Free Fall", repetition: false, massKg: 141, initialAngleDeg: 75, finalAngleDeg: 84.2, loadCellTopKn: 10.195, loadCellBottomKn: 2.226, cones: [{ index: 1, slipMm: 140.6 }] },
        { testId: "VP5.8", scenario: "Free Fall", repetition: true, massKg: 141, initialAngleDeg: 75, finalAngleDeg: 82.4, loadCellTopKn: 13.269, loadCellBottomKn: 1.265, cones: [{ index: 1, slipMm: 19.85 }] },
        { testId: "Extra_75", scenario: "Free Fall", repetition: true, massKg: 141, initialAngleDeg: 75, finalAngleDeg: 82.7, loadCellTopKn: 7.289, loadCellBottomKn: 2.168, cones: [{ index: 1, slipMm: 1 }] }
    ],

    // Grouping repetitions and retaining the maximum value per parameter for sizing
    getGroupedSummary() {
        const groups = {};
        this.rawTestData.forEach(rec => {
            const key = `${rec.initialAngleDeg}_${rec.massKg}_${rec.scenario}`;
            if (!groups[key]) {
                groups[key] = {
                    initialAngleDeg: rec.initialAngleDeg,
                    massKg: rec.massKg,
                    scenario: rec.scenario,
                    maxFinalAngleDeg: rec.finalAngleDeg || 0,
                    maxLoadCellTopKn: rec.loadCellTopKn || 0,
                    maxLoadCellBottomKn: rec.loadCellBottomKn || 0,
                    maxCone1SlipMm: (rec.cones && rec.cones[0] && rec.cones[0].slipMm) ? rec.cones[0].slipMm : 0,
                    testsCount: 1
                };
            } else {
                const g = groups[key];
                g.testsCount++;
                if (rec.finalAngleDeg !== null && rec.finalAngleDeg > g.maxFinalAngleDeg) g.maxFinalAngleDeg = rec.finalAngleDeg;
                if (rec.loadCellTopKn !== null && rec.loadCellTopKn > g.maxLoadCellTopKn) g.maxLoadCellTopKn = rec.loadCellTopKn;
                if (rec.loadCellBottomKn !== null && rec.loadCellBottomKn > g.maxLoadCellBottomKn) g.maxLoadCellBottomKn = rec.loadCellBottomKn;
                const slip = (rec.cones && rec.cones[0] && rec.cones[0].slipMm) ? rec.cones[0].slipMm : 0;
                if (slip > g.maxCone1SlipMm) g.maxCone1SlipMm = slip;
            }
        });
        return groups;
    },

    // Linear extrapolation/interpolation engine for target slope angle (0° to 90°), span length, and multi-span cone setup
    getExtrapolatedData(targetAngleDeg, massKg = 141, scenario = "Free Fall", actualSpanM = 6.0, totalLineM = 15.0) {
        const groups = this.getGroupedSummary();
        const availableAngles = [15, 30, 45, 60, 75];
        
        const targetMass = massKg <= 75 ? 50 : 141;

        const points = availableAngles.map(angle => {
            const key = `${angle}_${targetMass}_${scenario}`;
            const fallbackKey = `${angle}_141_Free Fall`;
            const data = groups[key] || groups[fallbackKey] || {
                maxFinalAngleDeg: angle * 1.1,
                maxLoadCellTopKn: 5.0,
                maxLoadCellBottomKn: 2.5,
                maxCone1SlipMm: 5.0
            };
            return {
                angle,
                finalAngle: data.maxFinalAngleDeg,
                lc1Top: data.maxLoadCellTopKn,
                lc2Bottom: data.maxLoadCellBottomKn,
                cone1Slip: data.maxCone1SlipMm
            };
        });

        const angle = Math.max(0, Math.min(90, targetAngleDeg));

        let p1, p2;
        if (angle <= points[0].angle) {
            p1 = points[0];
            p2 = points[1];
        } else if (angle >= points[points.length - 1].angle) {
            p1 = points[points.length - 2];
            p2 = points[points.length - 1];
        } else {
            for (let i = 0; i < points.length - 1; i++) {
                if (angle >= points[i].angle && angle <= points[i + 1].angle) {
                    p1 = points[i];
                    p2 = points[i + 1];
                    break;
                }
            }
        }

        const t = (angle - p1.angle) / (p2.angle - p1.angle);
        const interpolate = (v1, v2) => Math.max(0, v1 + t * (v2 - v1));

        const baseFinalAngle = interpolate(p1.finalAngle, p2.finalAngle);
        const baseLc1Top = interpolate(p1.lc1Top, p2.lc1Top);
        const baseLc2Bottom = interpolate(p1.lc2Bottom, p2.lc2Bottom);
        const baseCone1Slip = interpolate(p1.cone1Slip, p2.cone1Slip);

        // Reference span length in standard test matrix = 6.0m
        const refSpanM = 6.0;
        const validSpan = Math.max(1.0, actualSpanM || 6.0);
        const spanRatio = validSpan / refSpanM;
        const spanScale = Math.sqrt(spanRatio); // tension scales with sqrt(span_ratio)

        // Calculate dynamic number of spans and cones
        const validLine = Math.max(validSpan, totalLineM || 15.0);
        const numSpans = Math.max(1, Math.round(validLine / validSpan));
        const numCones = Math.max(1, numSpans - 1);

        // Multi-span transfer factor (cables across multiple intermediate cone guides)
        const multiSpanFactorLC1 = 1 + 0.08 * (numSpans - 1);
        const multiSpanFactorLC2 = 1 + 0.05 * (numSpans - 1);

        const loadCellTopKn = baseLc1Top * spanScale * multiSpanFactorLC1;
        const loadCellBottomKn = baseLc2Bottom * spanScale * multiSpanFactorLC2;

        // Cone slip calculation: ONLY Cone 1 (C1) absorbs slip
        const primarySlip = parseFloat((baseCone1Slip * spanScale).toFixed(2));
        const conesList = [{
            index: 1,
            impacted: primarySlip > 0.5,
            slipMm: primarySlip
        }];

        return {
            initialAngleDeg: angle,
            finalAngleDeg: parseFloat(baseFinalAngle.toFixed(2)),
            loadCellTopKn: parseFloat(loadCellTopKn.toFixed(3)),
            loadCellBottomKn: parseFloat(loadCellBottomKn.toFixed(3)),
            cone1SlipMm: primarySlip,
            cones: conesList,
            numSpans: numSpans,
            numCones: numCones
        };
    },

    // Generates a comprehensive report comparing all 4 mass & scenario combinations (50kg/140kg, Sliding/Free Fall)
    getFullScenarioReport(targetAngleDeg, actualSpanM = 6.0, totalLineM = 15.0) {
        const m50_sliding = this.getExtrapolatedData(targetAngleDeg, 50, "Sliding", actualSpanM, totalLineM);
        const m50_freefall = this.getExtrapolatedData(targetAngleDeg, 50, "Free Fall", actualSpanM, totalLineM);
        const m140_sliding = this.getExtrapolatedData(targetAngleDeg, 141, "Sliding", actualSpanM, totalLineM);
        const m140_freefall = this.getExtrapolatedData(targetAngleDeg, 141, "Free Fall", actualSpanM, totalLineM);

        const allRuns = [m50_sliding, m50_freefall, m140_sliding, m140_freefall];

        const maxFinalAngle = Math.max(...allRuns.map(r => r.finalAngleDeg));
        const maxLC1 = Math.max(...allRuns.map(r => r.loadCellTopKn));
        const maxLC2 = Math.max(...allRuns.map(r => r.loadCellBottomKn));

        const coneSlipMax = Math.max(...allRuns.map(r => (r.cones[0] ? r.cones[0].slipMm : 0)));
        const maxConesList = [{
            index: 1,
            impacted: coneSlipMax > 0.5,
            slipMm: parseFloat(coneSlipMax.toFixed(2))
        }];

        return {
            targetAngleDeg,
            actualSpanM,
            totalLineM,
            scenarios: {
                m50_sliding,
                m50_freefall,
                m140_sliding,
                m140_freefall
            },
            retainedMax: {
                initialAngleDeg: targetAngleDeg,
                finalAngleDeg: maxFinalAngle,
                loadCellTopKn: maxLC1,
                loadCellBottomKn: maxLC2,
                cone1SlipMm: maxConesList[0] ? maxConesList[0].slipMm : 0,
                cones: maxConesList
            }
        };
    }
};

const newProPredictRecords = [
    { configId: "GP1", zone: "Grande portée", portee: 15, direction: "sol_mur", ancrage: "ocho+", users: 1, fmax_ancre: 5.1, force_ext1: 13.9, force_ext2: 13.7, fleche: 1300, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP5", zone: "Grande portée", portee: 15, direction: "omega", ancrage: "ocho+", users: 1, fmax_ancre: 4.4, force_ext1: 12.2, force_ext2: 12.2, fleche: 1290, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP9", zone: "Grande portée", portee: 15, direction: "omega_mini", ancrage: "ocho+", users: 1, fmax_ancre: 4.7, force_ext1: 12.9, force_ext2: 12.5, fleche: 1410, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP10", zone: "Grande portée", portee: 15, direction: "overhead", ancrage: "ocho+", users: 1, fmax_ancre: 4.4, force_ext1: 10.8, force_ext2: 10.4, fleche: 1640, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP1", zone: "Petite portée", portee: 3, direction: "sol_mur", ancrage: "ocho+", users: 1, fmax_ancre: 6.4, force_ext1: 9.7, force_ext2: 9.6, fleche: 490, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP5", zone: "Petite portée", portee: 3, direction: "omega", ancrage: "ocho+", users: 1, fmax_ancre: 5.0, force_ext1: 7.1, force_ext2: 7.2, fleche: 495, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP9", zone: "Petite portée", portee: 3, direction: "omega_mini", ancrage: "ocho+", users: 1, fmax_ancre: 5.7, force_ext1: 10.1, force_ext2: 10.0, fleche: 450, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP10", zone: "Petite portée", portee: 3, direction: "overhead", ancrage: "ocho+", users: 1, fmax_ancre: 7.2, force_ext1: 11.3, force_ext2: 11.1, fleche: 485, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP1", zone: "Grande portée", portee: 15, direction: "sol_mur", ancrage: "ocho+", users: 2, fmax_ancre: 6.15, force_ext1: 13.9, force_ext2: 13.85, fleche: 1700, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP1", zone: "Grande portée", portee: 15, direction: "sol_mur", ancrage: "ocho+", users: 3, fmax_ancre: 7.2, force_ext1: 13.9, force_ext2: 14.0, fleche: 2105, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP1", zone: "Grande portée", portee: 15, direction: "sol_mur", ancrage: "ocho+", users: 4, fmax_ancre: 7.6, force_ext1: 14.7, force_ext2: 14.7, fleche: 2105, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP1", zone: "Grande portée", portee: 15, direction: "sol_mur", ancrage: "ocho+", users: 5, fmax_ancre: 8.3, force_ext1: 16.0, force_ext2: 16.0, fleche: 2105, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP5", zone: "Grande portée", portee: 15, direction: "omega", ancrage: "ocho+", users: 2, fmax_ancre: 5.45, force_ext1: 12.6, force_ext2: 12.6, fleche: 1550, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP5", zone: "Grande portée", portee: 15, direction: "omega", ancrage: "ocho+", users: 3, fmax_ancre: 6.5, force_ext1: 13.0, force_ext2: 13.0, fleche: 1810, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP5", zone: "Grande portée", portee: 15, direction: "omega", ancrage: "ocho+", users: 4, fmax_ancre: 6.8, force_ext1: 14.1, force_ext2: 13.9, fleche: 1830, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP5", zone: "Grande portée", portee: 15, direction: "omega", ancrage: "ocho+", users: 5, fmax_ancre: 7.3, force_ext1: 14.8, force_ext2: 14.6, fleche: 1875, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP9", zone: "Grande portée", portee: 15, direction: "omega_mini", ancrage: "ocho+", users: 2, fmax_ancre: 6.1, force_ext1: 13.25, force_ext2: 13.2, fleche: 1760, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP9", zone: "Grande portée", portee: 15, direction: "omega_mini", ancrage: "ocho+", users: 3, fmax_ancre: 7.5, force_ext1: 13.6, force_ext2: 13.9, fleche: 2110, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP9", zone: "Grande portée", portee: 15, direction: "omega_mini", ancrage: "ocho+", users: 4, fmax_ancre: 7.8, force_ext1: 14.1, force_ext2: 14.4, fleche: 2110, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP9", zone: "Grande portée", portee: 15, direction: "omega_mini", ancrage: "ocho+", users: 5, fmax_ancre: 8.5, force_ext1: 15.6, force_ext2: 15.8, fleche: 2110, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP10", zone: "Grande portée", portee: 15, direction: "overhead", ancrage: "ocho+", users: 2, fmax_ancre: 5.8, force_ext1: 12.8, force_ext2: 12.6, fleche: 1745, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP10", zone: "Grande portée", portee: 15, direction: "overhead", ancrage: "ocho+", users: 3, fmax_ancre: 7.2, force_ext1: 14.8, force_ext2: 14.8, fleche: 1850, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP10", zone: "Grande portée", portee: 15, direction: "overhead", ancrage: "ocho+", users: 4, fmax_ancre: 7.2, force_ext1: 14.8, force_ext2: 14.8, fleche: 1860, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "GP10", zone: "Grande portée", portee: 15, direction: "overhead", ancrage: "ocho+", users: 5, fmax_ancre: 8.0, force_ext1: 16.2, force_ext2: 16.2, fleche: 1860, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP1", zone: "Petite portée", portee: 3, direction: "sol_mur", ancrage: "ocho+", users: 2, fmax_ancre: 7.95, force_ext1: 11.0, force_ext2: 11.0, fleche: 532, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP1", zone: "Petite portée", portee: 3, direction: "sol_mur", ancrage: "ocho+", users: 3, fmax_ancre: 9.5, force_ext1: 12.3, force_ext2: 12.4, fleche: 575, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP1", zone: "Petite portée", portee: 3, direction: "sol_mur", ancrage: "ocho+", users: 4, fmax_ancre: 9.9, force_ext1: 13.1, force_ext2: 13.2, fleche: 585, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP1", zone: "Petite portée", portee: 3, direction: "sol_mur", ancrage: "ocho+", users: 5, fmax_ancre: 9.8, force_ext1: 12.6, force_ext2: 12.7, fleche: 610, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP5", zone: "Petite portée", portee: 3, direction: "omega", ancrage: "ocho+", users: 2, fmax_ancre: 6.65, force_ext1: 8.85, force_ext2: 8.75, fleche: 527, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP5", zone: "Petite portée", portee: 3, direction: "omega", ancrage: "ocho+", users: 3, fmax_ancre: 8.3, force_ext1: 10.6, force_ext2: 10.3, fleche: 560, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP5", zone: "Petite portée", portee: 3, direction: "omega", ancrage: "ocho+", users: 4, fmax_ancre: 8.5, force_ext1: 10.5, force_ext2: 10.2, fleche: 560, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP5", zone: "Petite portée", portee: 3, direction: "omega", ancrage: "ocho+", users: 5, fmax_ancre: 8.8, force_ext1: 10.6, force_ext2: 10.4, fleche: 560, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP9", zone: "Petite portée", portee: 3, direction: "omega_mini", ancrage: "ocho+", users: 2, fmax_ancre: 7.2, force_ext1: 11.3, force_ext2: 11.35, fleche: 502, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP9", zone: "Petite portée", portee: 3, direction: "omega_mini", ancrage: "ocho+", users: 3, fmax_ancre: 8.7, force_ext1: 12.5, force_ext2: 12.7, fleche: 555, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP9", zone: "Petite portée", portee: 3, direction: "omega_mini", ancrage: "ocho+", users: 4, fmax_ancre: 8.9, force_ext1: 11.5, force_ext2: 12.0, fleche: 585, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP9", zone: "Petite portée", portee: 3, direction: "omega_mini", ancrage: "ocho+", users: 5, fmax_ancre: 9.1, force_ext1: 11.8, force_ext2: 11.8, fleche: 625, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP10", zone: "Petite portée", portee: 3, direction: "overhead", ancrage: "ocho+", users: 2, fmax_ancre: 8.55, force_ext1: 13.35, force_ext2: 13.25, fleche: 495, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP10", zone: "Petite portée", portee: 3, direction: "overhead", ancrage: "ocho+", users: 3, fmax_ancre: 9.9, force_ext1: 15.4, force_ext2: 15.4, fleche: 505, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP10", zone: "Petite portée", portee: 3, direction: "overhead", ancrage: "ocho+", users: 4, fmax_ancre: 10.2, force_ext1: 15.4, force_ext2: 15.4, fleche: 505, supportType: "Rigide", fallFactor: 2.0 },
    { configId: "PP10", zone: "Petite portée", portee: 3, direction: "overhead", ancrage: "ocho+", users: 5, fmax_ancre: 10.3, force_ext1: 15.4, force_ext2: 15.5, fleche: 505, supportType: "Rigide", fallFactor: 2.0 }
];

const longRangePredictRecords = [
    { portee: 56.0, users: 1, fmax_ancre: 4.0, force_ext1: 17.9, force_ext2: 18.0, fleche: 2600.0, configId: "EN795" },
    { portee: 56.0, users: 2, fmax_ancre: 4.55, force_ext1: 19.45, force_ext2: 19.6, fleche: 2930.0, configId: "EN795" },
    { portee: 56.0, users: 3, fmax_ancre: 5.1, force_ext1: 21.0, force_ext2: 21.2, fleche: 3260.0, configId: "EN795" },
    { portee: 34.0, users: 1, fmax_ancre: 4.5, force_ext1: 16.3, force_ext2: 16.8, fleche: 2450.0, configId: "EN795" },
    { portee: 34.0, users: 2, fmax_ancre: 5.8, force_ext1: 17.7, force_ext2: 18.35, fleche: 2810.0, configId: "EN795" },
    { portee: 34.0, users: 3, fmax_ancre: 7.1, force_ext1: 19.1, force_ext2: 19.9, fleche: 3170.0, configId: "EN795" },
    { portee: 10.0, users: 1, fmax_ancre: 4.8, force_ext1: 14.0, force_ext2: 14.7, fleche: 780.0, configId: "EN795" },
    { portee: 10.0, users: 2, fmax_ancre: 6.45, force_ext1: 17.95, force_ext2: 18.55, fleche: 842.0, configId: "EN795" },
    { portee: 10.0, users: 3, fmax_ancre: 8.1, force_ext1: 21.9, force_ext2: 22.4, fleche: 905.0, configId: "EN795" }
];

function calculateTriangleTension(fmax_ancre, portee, fleche) {
    if (fleche <= 0.0) return 0.0;
    const f_m = fleche / 1000.0;
    return fmax_ancre * Math.sqrt(portee * portee + 4.0 * f_m * f_m) / (4.0 * f_m);
}

function getBaselineFmax(system, users, portee, supportType) {
    const sType = (supportType || "").toLowerCase();
    if (system === "LIGHT PRO") {
        const t = Math.max(0.0, Math.min(1.0, (portee - 2.0) / (15.0 - 2.0)));
        if (sType.includes("hookt")) {
            if (users === 1) return 5.6 + t * (5.0 - 5.6);
            if (users === 2) return 6.3 + t * (6.2 - 6.3);
            if (users === 3) return 7.0 + t * (7.4 - 7.0);
            return 7.4;
        } else if (sType.includes("pb250")) {
            if (users === 1) return 5.6 + t * (8.3 - 5.6);
            if (users === 2) return 6.0 + t * (7.4 - 6.0);
            return 8.3;
        } else {
            if (users === 1) return 6.4 + t * (6.3 - 6.4);
            if (users === 2) return 7.2 + t * (7.1 - 7.2);
            if (users === 3) return 8.0 + t * (7.9 - 8.0);
            return 8.0;
        }
    }
    if (system === "LONG RANGE" || system === "LongRange") {
        let f10 = 4.8, f34 = 4.5, f56 = 4.0;
        let usersToUse = Math.max(1, Math.min(users, 3));
        if (usersToUse === 2) { f10 = 6.45; f34 = 5.8; f56 = 4.55; }
        else if (usersToUse === 3) { f10 = 8.1; f34 = 7.1; f56 = 5.1; }

        if (portee <= 10.0) return f10;
        if (portee <= 34.0) {
            const t = (portee - 10.0) / (34.0 - 10.0);
            return f10 + t * (f34 - f10);
        }
        if (portee <= 56.0) {
            const t = (portee - 34.0) / (56.0 - 34.0);
            return f34 + t * (f56 - f34);
        }
        const t = (portee - 34.0) / (56.0 - 34.0);
        const val = f34 + t * (f56 - f34);
        return val < 2.0 ? 2.0 : val;
    }
    return 6.0;
}

function getActiveSupportType() {
    if (typeof state === 'undefined') return "omega_mini";
    if (state.product === "LONG RANGE" && (state.mountingType === "overhead" || state.roofShape === "flat_overhead")) return "overhead";
    const list = (typeof COMPONENTS_DB !== 'undefined' ? COMPONENTS_DB[state.product] : []) || [];
    const checked = list.find(c => c.checked);
    if (checked) {
        const id = checked.id.toLowerCase();
        if (id.includes("poteau_haut") || id.includes("overhead")) return "overhead";
        if (id.includes("mini")) return "omega_mini";
        if (id.includes("pb_hookt") || id.includes("hookt")) return "hookt";
        if (id.includes("galva")) return "pb250";
        if (id.includes("omega")) return "omega";
    }
    return state.mountingType || "omega_mini";
}

function getActivePostName() {
    if (typeof state === 'undefined') return "MINI OMEGA";
    const l = state.lang || 0;
    if (state.product === "LONG RANGE") {
        return ["ANCRAGE A-FIX", "A-FIX ANCHOR", "ANCLAJE A-FIX"][l];
    }
    const list = (typeof COMPONENTS_DB !== 'undefined' ? COMPONENTS_DB[state.product] : []) || [];
    const postComp = list.find(c => c.id !== "Contre_Plaque" && c.id !== "X-Cone" && c.id !== "Pack_Matrix" && c.id !== "X-Matrix" && c.id !== "New_Pro" && c.id !== "LightPro" && c.id !== "LongRange" && c.checked);
    if (postComp) return getComponentName(postComp);
    if (state.product === "NEW PRO") return getComponentName({ id: "Mini_Omega", name: "MINI OMEGA" });
    if (state.product === "LIGHT PRO") return ["Potelet Basculant", "Tilting Post", "Poste Basculante"][l];
    return ["Potelet / Ancrage", "Post / Anchor", "Poste / Anclaje"][l];
}

const Calculator = {
    getXConeSpacing: function () {
        if (state.roofShape !== "sloped") return 0;
        const slope = state.roofSlope || 0;
        if (slope >= 40 && slope <= 75) return 0.3;
        if (slope >= 30 && slope < 40) return 0.5;
        if (slope >= 15 && slope < 30) return 1.0;
        return 0;
    },

    getMaxSpan: function (product) {
        if (product === "LONG RANGE" || product === "LongRange") return 56.0;
        if (state.roofShape === "sloped" && state.roofSlope >= 40 && state.roofSlope <= 75) {
            return 3.0;
        }
        return 15.0;
    },

    calculateAnchorPositions: function (L, l, maxSpan) {
        const activeSpan = (state.spanMode === "custom")
            ? Math.min(Math.max(0.1, state.customSpan || 5.0), maxSpan)
            : maxSpan;
        const lineLenTotal = state.lineLength;
        const marginPerEnd = (state.product === "LONG RANGE") ? 0.30 : 0.20;
        const lineLen = Math.max(0.5, lineLenTotal);

        // On sloped mono-pitch roof, Line 1 runs along Z (slope direction)
        if (state.roofShape === "sloped") {
            const slopeRad = (state.roofSlope || 0) * (Math.PI / 180);
            const line1LenGround = lineLen * Math.cos(slopeRad);

            state.l = lineLenTotal * Math.cos(slopeRad) + 6.0;
            state.L = state.hasLine2 ? Math.max(12.0, state.line2Length + 6.0) : 12.0;

            const startZ = 3.0 + marginPerEnd * Math.cos(slopeRad);
            const xPos = state.hasLine2 ? (state.L - state.line2Length) / 2 : state.L / 2;
            const line1Nodes = [];
            const intCount1 = Math.max(1, Math.ceil(lineLen / activeSpan));
            const step1Ground = line1LenGround / intCount1;

            for (let i = 0; i <= intCount1; i++) {
                const z = startZ + i * step1Ground;
                const type = (i === 0 || i === intCount1) ? "extremite" : "intermediaire";
                line1Nodes.push({
                    x: parseFloat(xPos.toFixed(2)),
                    y: 0.0,
                    z: parseFloat(z.toFixed(4)),
                    type: type,
                    rotY: Math.PI / 2,
                    line: 1
                });
            }

            if (state.hasLine2) {
                const line2Nodes = [];
                const endZ = startZ + line1LenGround;
                const line2LenTotal = state.line2Length;
                const line2Len = Math.max(0.5, line2LenTotal);
                const intCount2 = Math.max(1, Math.ceil(line2Len / activeSpan));
                const step2 = line2Len / intCount2;

                for (let j = 1; j <= intCount2; j++) {
                    const x2 = xPos + j * step2;
                    const type2 = (j === intCount2) ? "extremite" : "intermediaire";
                    line2Nodes.push({
                        x: parseFloat(x2.toFixed(2)),
                        y: 0.0,
                        z: parseFloat(endZ.toFixed(2)),
                        type: type2,
                        rotY: 0,
                        line: 2
                    });
                }

                return {
                    line1: line1Nodes,
                    line2: line2Nodes,
                    junctionNode: line1Nodes[line1Nodes.length - 1],
                    all: [...line1Nodes, ...line2Nodes]
                };
            }

            return {
                line1: line1Nodes,
                line2: [],
                junctionNode: null,
                all: line1Nodes
            };
        }

        // Calculate deflection dynamically to determine if lifeline needs to step back from roof edge
        const isOSHA = (state.norm === "OSHA");
        const isMultiSpanAllowed = isOSHA && (state.product === "NEW PRO" || state.product === "LIGHT PRO" || state.product === "LightPro");
        const isMultiSpan = isMultiSpanAllowed && (state.oshaSpanMode === "multi") && (lineLen >= 12.0);

        let intCountForDefl = 1;
        if (state.product === "LONG RANGE" || state.product === "LongRange") {
            intCountForDefl = 1;
        } else if (isMultiSpan) {
            intCountForDefl = Math.max(3, Math.ceil(lineLen / maxSpan));
        } else if (state.spanMode === "custom") {
            intCountForDefl = Math.max(1, Math.ceil(lineLen / activeSpan));
        } else {
            intCountForDefl = (lineLen < 12.0) ? 1 : Math.max(1, Math.ceil(lineLen / maxSpan));
        }
        const spanForDeflection = lineLen / intCountForDefl;
        const supportType = (typeof getActiveSupportType === "function") ? getActiveSupportType() : "beton";
        const deflMeters = Calculator.deflection(
            state.product,
            spanForDeflection,
            state.fallFactor || 2,
            supportType,
            state.nbUsers || 1,
            state.norm || "OSHA",
            isMultiSpan
        ) / 1000.0;

        const baseEdgeDist = (state.edgeDistance !== undefined && state.edgeDistance !== null) ? state.edgeDistance : 3.0;
        const requiredEdgeDist = deflMeters + 0.30;
        const zPos = (state.roofShape === "triangle")
            ? (state.l / 2)
            : Math.max(baseEdgeDist, requiredEdgeDist);

        // Determine roof dimensions based on line 1 and line 2 lengths and required zPos
        state.L = lineLenTotal + 6.0;
        if (state.roofShape !== "triangle" && state.roofShape !== "sloped") {
            if (state.hasLine2) {
                state.l = Math.max(12.0, state.line2Length + 6.0, zPos + 6.0);
            } else {
                state.l = Math.max(12.0, zPos + 6.0);
            }
        }

        const startX = 3.0 + marginPerEnd;

        const line1Nodes = [];

        if (state.hasLine2) {
            const endX = startX + lineLen;
            const cornerR = 0.8;
            const cornerX = endX;
            const cornerZ = zPos;

            // Line 1 nodes (from startX to cornerX - cornerR)
            const line1LenActual = lineLen - cornerR;
            const intCount1 = Math.max(1, Math.ceil(line1LenActual / activeSpan));
            const step1 = line1LenActual / intCount1;

            for (let i = 0; i < intCount1; i++) {
                const x = startX + i * step1;
                const type = (i === 0) ? "extremite" : "intermediaire";
                line1Nodes.push({ x: parseFloat(x.toFixed(2)), y: 0.0, z: parseFloat(zPos.toFixed(2)), type: type, line: 1 });
            }

            // Post 1 (positioned on Line 1 at cornerX - cornerR, aligned with Line 1)
            const cornerPost1 = {
                x: parseFloat((cornerX - cornerR).toFixed(2)),
                y: 0.0,
                z: parseFloat(cornerZ.toFixed(2)),
                type: "intermediaire",
                rotY: 0,
                line: 1
            };
            line1Nodes.push(cornerPost1);

            // Line 2 nodes (starting at cornerZ + cornerR)
            const line2Nodes = [];
            const cornerPost2 = {
                x: parseFloat(cornerX.toFixed(2)),
                y: 0.0,
                z: parseFloat((cornerZ + cornerR).toFixed(2)),
                type: "intermediaire",
                rotY: (3 * Math.PI) / 2,
                line: 2
            };
            line2Nodes.push(cornerPost2);

            const line2LenTotal = state.line2Length;
            const line2Len = Math.max(0.5, line2LenTotal);
            const line2LenActual = line2Len - cornerR;
            if (line2LenActual <= 0) {
                line2Nodes[0].type = "extremite";
            } else {
                const intCountL2 = Math.max(1, Math.ceil(line2LenActual / activeSpan));
                const stepL2 = line2LenActual / intCountL2;

                for (let j = 1; j <= intCountL2; j++) {
                    const z2 = cornerZ + cornerR + j * stepL2;
                    const type2 = (j === intCountL2) ? "extremite" : "intermediaire";
                    line2Nodes.push({
                        x: parseFloat(cornerX.toFixed(2)),
                        y: 0.0,
                        z: parseFloat(z2.toFixed(2)),
                        type: type2,
                        rotY: (3 * Math.PI) / 2,
                        line: 2
                    });
                }
            }

            return {
                line1: line1Nodes,
                line2: line2Nodes,
                junctionNode: cornerPost1,
                all: [...line1Nodes, ...line2Nodes]
            };
        } else {
            // Standard line 1 layout (Multi-span allowed strictly for NEW PRO and LIGHT PRO on OSHA)
            const endX = startX + lineLen;
            const isOSHA = (state.norm === "OSHA");
            const isMultiSpanAllowed = isOSHA && (state.product === "NEW PRO" || state.product === "LIGHT PRO" || state.product === "LightPro");
            const isMultiSpan = isMultiSpanAllowed && (state.oshaSpanMode === "multi") && (lineLen >= 12.0);

            let intCount1 = 1;
            if (state.product === "LONG RANGE" || state.product === "LongRange") {
                intCount1 = 1; // Long Range strictly uses 2 anchors (0 intermediate anchors) under all standards
            } else if (isMultiSpan) {
                intCount1 = Math.max(3, Math.ceil(lineLen / maxSpan));
            } else if (state.spanMode === "custom") {
                intCount1 = Math.max(1, Math.ceil(lineLen / activeSpan));
            } else {
                intCount1 = (lineLen < 12.0) ? 1 : Math.max(1, Math.ceil(lineLen / maxSpan));
            }
            const step1 = lineLen / intCount1;

            for (let i = 0; i <= intCount1; i++) {
                const x = startX + i * step1;
                const type = (i === 0 || i === intCount1) ? "extremite" : "intermediaire";
                line1Nodes.push({
                    x: parseFloat(x.toFixed(2)),
                    y: 0.0,
                    z: parseFloat(zPos.toFixed(2)),
                    type: type,
                    line: 1
                });
            }
        }

        return {
            line1: line1Nodes,
            line2: [],
            junctionNode: null,
            all: line1Nodes
        };
    },

    calculateTotalLineLength: function (layout, product) {
        const prod = product || (typeof state !== 'undefined' ? state.product : "NEW PRO");
        const marginPerEnd = (prod === "LONG RANGE") ? 0.30 : 0.20;

        if (!layout) return 0.0;

        if (layout.line1 && Array.isArray(layout.line1)) {
            let total = 0.0;
            if (layout.line1.length >= 2) {
                for (let i = 0; i < layout.line1.length - 1; i++) {
                    const p1 = layout.line1[i];
                    const p2 = layout.line1[i + 1];
                    const y1 = p1.y + (typeof getRoofHeightAt === 'function' ? getRoofHeightAt(p1.x, p1.z) : 0);
                    const y2 = p2.y + (typeof getRoofHeightAt === 'function' ? getRoofHeightAt(p2.x, p2.z) : 0);
                    total += Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(y1 - y2, 2) + Math.pow(p1.z - p2.z, 2));
                }
                total += 2 * marginPerEnd;
            }

            if (layout.line2 && layout.line2.length > 0 && layout.junctionNode) {
                const jNode = layout.junctionNode;
                const pFirst = layout.line2[0];
                const yJ = jNode.y + (typeof getRoofHeightAt === 'function' ? getRoofHeightAt(jNode.x, jNode.z) : 0);
                const yF = pFirst.y + (typeof getRoofHeightAt === 'function' ? getRoofHeightAt(pFirst.x, pFirst.z) : 0);
                total += Math.sqrt(Math.pow(jNode.x - pFirst.x, 2) + Math.pow(yJ - yF, 2) + Math.pow(jNode.z - pFirst.z, 2));

                for (let i = 0; i < layout.line2.length - 1; i++) {
                    const p1 = layout.line2[i];
                    const p2 = layout.line2[i + 1];
                    const y1 = p1.y + (typeof getRoofHeightAt === 'function' ? getRoofHeightAt(p1.x, p1.z) : 0);
                    const y2 = p2.y + (typeof getRoofHeightAt === 'function' ? getRoofHeightAt(p2.x, p2.z) : 0);
                    total += Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(y1 - y2, 2) + Math.pow(p1.z - p2.z, 2));
                }
                total += marginPerEnd;
            }
            return total;
        }

        const positions = Array.isArray(layout) ? layout : (layout.all || []);
        if (positions.length < 2) return 0.0;
        let total = 0.0;
        for (let i = 0; i < positions.length - 1; i++) {
            const p1 = positions[i];
            const p2 = positions[i + 1];
            const y1 = p1.y + (typeof getRoofHeightAt === 'function' ? getRoofHeightAt(p1.x, p1.z) : 0);
            const y2 = p2.y + (typeof getRoofHeightAt === 'function' ? getRoofHeightAt(p2.x, p2.z) : 0);
            total += Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(y1 - y2, 2) + Math.pow(p1.z - p2.z, 2));
        }
        return total + 2 * marginPerEnd;
    },

    calculateMaxRealSpan: function (layout) {
        if (!layout) return 0.0;
        let maxDist = 0.0;

        function getSpanInList(nodesList) {
            if (!nodesList || nodesList.length < 2) return;
            for (let i = 0; i < nodesList.length - 1; i++) {
                const p1 = nodesList[i];
                const p2 = nodesList[i + 1];
                const y1 = p1.y + (typeof getRoofHeightAt === 'function' ? getRoofHeightAt(p1.x, p1.z) : 0);
                const y2 = p2.y + (typeof getRoofHeightAt === 'function' ? getRoofHeightAt(p2.x, p2.z) : 0);
                const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(y1 - y2, 2) + Math.pow(p1.z - p2.z, 2));
                if (dist > maxDist) maxDist = dist;
            }
        }

        const line1 = layout.line1 || (Array.isArray(layout) ? layout : []);
        getSpanInList(line1);

        if (layout.line2 && layout.line2.length > 0 && layout.junctionNode) {
            const jNode = layout.junctionNode;
            const p2First = layout.line2[0];
            const y1 = jNode.y + (typeof getRoofHeightAt === 'function' ? getRoofHeightAt(jNode.x, jNode.z) : 0);
            const y2 = p2First.y + (typeof getRoofHeightAt === 'function' ? getRoofHeightAt(p2First.x, p2First.z) : 0);
            const distJ = Math.sqrt(Math.pow(jNode.x - p2First.x, 2) + Math.pow(y1 - y2, 2) + Math.pow(jNode.z - p2First.z, 2));
            if (distJ > maxDist) maxDist = distJ;

            getSpanInList(layout.line2);
        }

        return maxDist;
    },

    effortLonge: function (product, span, nbUsers, norm = "OSHA", fallFactor = 1, support = "omega_mini", isMultiSpan = false) {
        let k_FC = fallFactor <= 0.0 ? 0.5 : (fallFactor < 1.0 ? 0.5 + fallFactor * (Math.sqrt(0.5) - 0.5) : (fallFactor < 2.0 ? Math.sqrt(0.5) + (fallFactor - 1.0) * (1.0 - Math.sqrt(0.5)) : 1.0));
        const u = Math.max(1, Math.min(5, nbUsers));
        const F_user = 1.37 * u + 4.65;
        let res = F_user * k_FC;
        if (product === "NEW PRO") {
            const spanClamped = Math.max(0.1, Math.min(15.2, span));
            const spanRatio = (15.2 - Math.max(3.0, spanClamped)) / (15.2 - 3.0);
            let k_support = 1.0;
            if (support === "omega") k_support = 5.0 / 5.7;
            else if (support === "sol_mur") k_support = 6.4 / 5.7;
            else if (support === "overhead") k_support = 7.2 / 5.7;
            res = F_user * (5.7 / 11.5) * k_support * k_FC * (1.0 + 0.15 * spanRatio);
        } else if (product === "LIGHT PRO" && span <= 3.5) {
            const fmax_base = u === 1 ? 5.0 : (u === 2 ? 5.8 : 6.5);
            res = fmax_base * k_FC;
        }
        if (span < 3.0) {
            res = res * Math.max(0.5, Math.sqrt(span / 3.0));
        }

        const forceLbf = (typeof state !== 'undefined' && state.arrestForceLbf) ? state.arrestForceLbf : 1350.0;
        const forceRatio = Math.max(0.1, forceLbf / 1350.0);
        const k_force = Math.sqrt(forceRatio);
        return res * k_force;
    },

    deflection: function (product, span, fallFactor = 1, support = "omega_mini", nbUsers = 1, norm = "OSHA", isMultiSpan = false) {
        let k_FC = fallFactor <= 0.0 ? 0.5 : (fallFactor < 1.0 ? 0.5 + fallFactor * (Math.sqrt(0.5) - 0.5) : (fallFactor < 2.0 ? Math.sqrt(0.5) + (fallFactor - 1.0) * (1.0 - Math.sqrt(0.5)) : 1.0));
        const u = Math.max(1, Math.min(5, nbUsers));
        const F_user = 1.37 * u + 4.65;
        let res = 500.0;
        if (product === "NEW PRO") {
            const spanRatio = Math.max(0.1, Math.min(15.2, span)) / 15.2;
            let k_support = support === "omega" ? 1290 / 1410 : (support === "sol_mur" ? 1300 / 1410 : (support === "overhead" ? 1640 / 1410 : 1.0));
            res = (isMultiSpan ? 1530.0 : 2200.0) * spanRatio * (F_user / 11.5) * k_support * k_FC;
        } else if (product === "LIGHT PRO") {
            if (span <= 3.5) {
                res = 675.0 * (span / 3.5) * k_FC;
            } else {
                const spanRatio = Math.max(0.1, Math.min(12.2, span)) / 12.2;
                let f_ref = support === "hookt" ? (isMultiSpan ? 2250.0 : 2600.0) : (isMultiSpan ? 1500.0 : 1800.0);
                res = f_ref * spanRatio * (F_user / 8.8) * k_FC;
            }
        } else if (product === "LONG RANGE" || product === "LongRange") {
            const spanRatio = Math.max(0.1, Math.min(54.9, span)) / 54.9;
            res = (isMultiSpan ? 1510.0 : 2790.0) * spanRatio * (F_user / 8.8) * k_FC;
        }

        const forceLbf = (typeof state !== 'undefined' && state.arrestForceLbf) ? state.arrestForceLbf : 1350.0;
        const forceRatio = Math.max(0.1, forceLbf / 1350.0);
        return Math.round(res * forceRatio);
    },

    extremiteForce1: function (product, span, nbUsers, norm = "OSHA", effortLonge = 0, deflection = 0, fallFactor = 1, support = "omega_mini", isMultiSpan = false) {
        let k_FC = fallFactor <= 0.0 ? 0.5 : (fallFactor < 1.0 ? 0.5 + fallFactor * (Math.sqrt(0.5) - 0.5) : (fallFactor < 2.0 ? Math.sqrt(0.5) + (fallFactor - 1.0) * (1.0 - Math.sqrt(0.5)) : 1.0));
        const u = Math.max(1, Math.min(5, nbUsers));
        const F_user = 1.37 * u + 4.65;
        let baseForce = 10.0;
        if (product === "NEW PRO") {
            baseForce = (isMultiSpan ? 13.05 : 12.50) * (F_user / 11.5) * k_FC;
        } else if (product === "LIGHT PRO") {
            if (span <= 3.5) {
                const lc1_base = u === 1 ? 5.4 : (u === 2 ? 6.1 : 6.8);
                baseForce = lc1_base * k_FC;
            } else {
                const spanRatio = 1.0 + (support === "hookt" ? 0.10 : 0.12) * ((12.2 - Math.max(2.0, Math.min(12.2, span))) / (12.2 - 2.0));
                let fext1_ref = support === "hookt" ? (isMultiSpan ? 8.30 : 9.00) : (isMultiSpan ? 13.65 : 11.60);
                baseForce = fext1_ref * (F_user / 8.8) * spanRatio * k_FC;
            }
        } else if (product === "LONG RANGE" || product === "LongRange") {
            baseForce = (isMultiSpan ? 10.40 : 19.30) * (F_user / 8.8) * k_FC;
        }
        if (span < 3.0) {
            baseForce = baseForce * Math.sqrt(Math.max(0.1, span / 3.0));
        }

        const forceLbf = (typeof state !== 'undefined' && state.arrestForceLbf) ? state.arrestForceLbf : 1350.0;
        const forceRatio = Math.max(0.1, forceLbf / 1350.0);
        const k_force = Math.sqrt(forceRatio);
        return baseForce * k_force;
    },

    extremiteForce2: function (product, span, nbUsers, norm = "OSHA", effortLonge = 0, deflection = 0, fallFactor = 1, support = "omega_mini", isMultiSpan = false) {
        let k_FC = fallFactor <= 0.0 ? 0.5 : (fallFactor < 1.0 ? 0.5 + fallFactor * (Math.sqrt(0.5) - 0.5) : (fallFactor < 2.0 ? Math.sqrt(0.5) + (fallFactor - 1.0) * (1.0 - Math.sqrt(0.5)) : 1.0));
        const u = Math.max(1, Math.min(5, nbUsers));
        const F_user = 1.37 * u + 4.65;
        let baseForce = 10.0;
        if (product === "NEW PRO") {
            baseForce = (isMultiSpan ? 12.55 : 12.05) * (F_user / 11.5) * k_FC;
        } else if (product === "LIGHT PRO") {
            if (span <= 3.5) {
                const lc2_base = u === 1 ? 5.8 : (u === 2 ? 6.5 : 7.2);
                baseForce = lc2_base * k_FC;
            } else {
                const spanRatio = 1.0 + (support === "hookt" ? 0.10 : 0.12) * ((12.2 - Math.max(2.0, Math.min(12.2, span))) / (12.2 - 2.0));
                let fext2_ref = support === "hookt" ? (isMultiSpan ? 8.10 : 9.00) : (isMultiSpan ? 13.05 : 11.30);
                baseForce = fext2_ref * (F_user / 8.8) * spanRatio * k_FC;
            }
        } else if (product === "LONG RANGE" || product === "LongRange") {
            baseForce = (isMultiSpan ? 10.20 : 18.95) * (F_user / 8.8) * k_FC;
        }
        if (span < 3.0) {
            baseForce = baseForce * Math.sqrt(Math.max(0.1, span / 3.0));
        }

        const forceLbf = (typeof state !== 'undefined' && state.arrestForceLbf) ? state.arrestForceLbf : 1350.0;
        const forceRatio = Math.max(0.1, forceLbf / 1350.0);
        const k_force = Math.sqrt(forceRatio);
        return baseForce * k_force;
    },

    extremiteForce3: function (product, span, nbUsers, norm = "OSHA", effortLonge = 0, deflection = 0, fallFactor = 1, support = "omega_mini", isMultiSpan = false) {
        if (!isMultiSpan) return 0.0;
        let k_FC = fallFactor <= 0.0 ? 0.5 : (fallFactor < 1.0 ? 0.5 + fallFactor * (Math.sqrt(0.5) - 0.5) : (fallFactor < 2.0 ? Math.sqrt(0.5) + (fallFactor - 1.0) * (1.0 - Math.sqrt(0.5)) : 1.0));
        const u = Math.max(1, Math.min(5, nbUsers));
        const F_user = 1.37 * u + 4.65;
        let res = 4.0;
        if (product === "NEW PRO") res = 3.90 * (F_user / 11.5) * k_FC;
        else if (product === "LIGHT PRO") res = (support === "hookt" ? 3.80 : 4.50) * (F_user / 8.8) * k_FC;
        else if (product === "LONG RANGE" || product === "LongRange") res = 3.90 * (F_user / 8.8) * k_FC;

        const forceLbf = (typeof state !== 'undefined' && state.arrestForceLbf) ? state.arrestForceLbf : 1350.0;
        const forceRatio = Math.max(0.1, forceLbf / 1350.0);
        const k_force = Math.sqrt(forceRatio);
        return res * k_force;
    },

    extremiteForce4: function (product, span, nbUsers, norm = "OSHA", effortLonge = 0, deflection = 0, fallFactor = 1, support = "omega_mini", isMultiSpan = false) {
        if (!isMultiSpan) return 0.0;
        let k_FC = fallFactor <= 0.0 ? 0.5 : (fallFactor < 1.0 ? 0.5 + fallFactor * (Math.sqrt(0.5) - 0.5) : (fallFactor < 2.0 ? Math.sqrt(0.5) + (fallFactor - 1.0) * (1.0 - Math.sqrt(0.5)) : 1.0));
        const u = Math.max(1, Math.min(5, nbUsers));
        const F_user = 1.37 * u + 4.65;
        let res = 5.0;
        if (product === "NEW PRO") res = 5.40 * (F_user / 11.5) * k_FC;
        else if (product === "LIGHT PRO") res = (support === "hookt" ? 4.20 : 5.10) * (F_user / 8.8) * k_FC;
        else if (product === "LONG RANGE" || product === "LongRange") res = 4.10 * (F_user / 8.8) * k_FC;

        const forceLbf = (typeof state !== 'undefined' && state.arrestForceLbf) ? state.arrestForceLbf : 1350.0;
        const forceRatio = Math.max(0.1, forceLbf / 1350.0);
        const k_force = Math.sqrt(forceRatio);
        return res * k_force;
    }
};

// ==========================================
// THREE.JS 3D ENGINE MODULE
// ==========================================
let scene, perspectiveCam, orthographicCam, activeCam, renderer, controls;
let roofMesh, gridHelper, anchorGroup, cableGroup, previewCableMesh, obstacleGroup;
let raycaster, mouseVector, mouseHoverPoint = null;

function initThreeEngine() {
    const container = document.getElementById("canvas3d");
    if (!container) return;

    let width = container.clientWidth;
    let height = container.clientHeight;

    if (width <= 0 || height <= 0) {
        const wrapper = container.closest(".canvas-wrapper") || container.parentElement;
        width = wrapper && wrapper.clientWidth > 0 ? wrapper.clientWidth : 800;
        height = wrapper && wrapper.clientHeight > 0 ? wrapper.clientHeight : 500;
    }

    // 1. Scene with soft slate background for maximum 3D visual contrast
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);

    // 2. Cameras
    const aspect = (height > 0) ? (width / height) : (16 / 9);
    perspectiveCam = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    perspectiveCam.position.set(25, 20, 25);

    const d = 20;
    orthographicCam = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 1000);
    orthographicCam.position.set(state.L / 2, 40, state.l / 2);
    orthographicCam.lookAt(state.L / 2, 0, state.l / 2);

    activeCam = perspectiveCam;

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 4. Orbit Controls
    controls = new THREE.OrbitControls(perspectiveCam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.6);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(30, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // Groups & Raycaster
    anchorGroup = new THREE.Group();
    scene.add(anchorGroup);

    cableGroup = new THREE.Group();
    scene.add(cableGroup);

    obstacleGroup = new THREE.Group();
    scene.add(obstacleGroup);

    raycaster = new THREE.Raycaster();
    mouseVector = new THREE.Vector2();

    renderer.domElement.addEventListener("pointermove", onCanvasPointerMove);
    renderer.domElement.addEventListener("pointerdown", onCanvasPointerDown);

    window.addEventListener("resize", onWindowResize);
    if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => onWindowResize());
        ro.observe(container);
    }

    preloadActiveModels();

    update3DScene();
    animate();
}

function onCanvasPointerMove(e) {
    if (!renderer || !roofMesh) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouseVector.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVector.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (state.drawingMode === "draw" && state.customPoints.length > 0) {
        raycaster.setFromCamera(mouseVector, activeCam);
        const intersects = raycaster.intersectObject(roofMesh, true);
        if (intersects.length > 0) {
            const pt = intersects[0].point;
            mouseHoverPoint = new THREE.Vector3(
                Math.max(0.1, Math.min(state.L - 0.1, pt.x)),
                pt.y + 0.54,
                Math.max(0.1, Math.min(state.l - 0.1, pt.z))
            );
            updatePreviewCable();
        }
    }
}

function onCanvasPointerDown(e) {
    if (!renderer || !roofMesh) return;
    if (e.button !== 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouseVector.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVector.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouseVector, activeCam);

    if (state.drawingMode === "draw") {
        const intersects = raycaster.intersectObject(roofMesh, true);
        if (intersects.length > 0) {
            const pt = intersects[0].point;
            const xClamped = Math.max(0.2, Math.min(state.L - 0.2, pt.x));
            const zClamped = Math.max(0.2, Math.min(state.l - 0.2, pt.z));

            const isFirst = state.customPoints.length === 0;
            state.customPoints.push({
                x: parseFloat(xClamped.toFixed(2)),
                y: 0.0,
                z: parseFloat(zClamped.toFixed(2)),
                type: isFirst ? "extremite" : "intermediaire"
            });

            update3DScene();
        }
    } else if (state.drawingMode === "place") {
        const intersects = raycaster.intersectObjects(anchorGroup.children, true);
        if (intersects.length > 0) {
            let hitObj = intersects[0].object;
            while (hitObj.parent && hitObj.parent !== anchorGroup) {
                hitObj = hitObj.parent;
            }
            const nodeIndex = anchorGroup.children.indexOf(hitObj);
            if (nodeIndex >= 0) {
                state.selectedNodeIndex = nodeIndex;
                highlightSelectedNode();
            }
        }
    }
}

function autoAlignNodeRotation(idx) {
    const activePositions = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
    if (idx < 0 || idx >= activePositions.length) return;

    const node = state.customPoints[idx] || activePositions[idx];
    if (activePositions.length > 1) {
        let dx = 0, dz = 0;
        if (idx < activePositions.length - 1) {
            const next = activePositions[idx + 1];
            dx = next.x - node.x;
            dz = next.z - node.z;
        } else {
            const prev = activePositions[idx - 1];
            dx = node.x - prev.x;
            dz = node.z - prev.z;
        }
        if (dx !== 0 || dz !== 0) {
            node.rotY = Math.atan2(dz, dx);
        }
    }
}

function highlightSelectedNode() {
    const card = document.getElementById("node-inspector-card");
    const activePositions = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));

    if (state.selectedNodeIndex < 0 || state.selectedNodeIndex >= activePositions.length) {
        if (card) card.classList.add("hidden");
        return;
    }

    const pos = activePositions[state.selectedNodeIndex];
    const node = (state.drawingMode !== "auto" && state.customPoints[state.selectedNodeIndex]) ? state.customPoints[state.selectedNodeIndex] : pos;

    if (card) {
        card.classList.remove("hidden");
        document.getElementById("node-id-val").textContent = `#${state.selectedNodeIndex + 1}`;
        document.getElementById("node-coords-val").textContent = `X: ${formatDistance(node.x, 2, state.lang)}, Z: ${formatDistance(node.z, 2, state.lang)}`;

        let nextSpan = 0.0;
        if (state.selectedNodeIndex < activePositions.length - 1) {
            const next = activePositions[state.selectedNodeIndex + 1];
            nextSpan = Math.sqrt(Math.pow(node.x - next.x, 2) + Math.pow(node.z - next.z, 2));
        }
        document.getElementById("node-span-val").textContent = formatDistance(nextSpan, 2, state.lang);
        document.getElementById("node-type-select").value = node.type || "intermediaire";

        // Update component selection dropdown
        const compSelect = document.getElementById("node-comp-select");
        if (compSelect) {
            compSelect.innerHTML = `<option value="">${["Standard Potelet", "Standard Post", "Poste Estándar"][state.lang || 0]}</option>`;
            const allComps = COMPONENTS_DB[state.product] || [];
            allComps.forEach(c => {
                const opt = document.createElement("option");
                opt.value = c.id;
                opt.textContent = getComponentName(c);
                if (node.compId === c.id) opt.selected = true;
                compSelect.appendChild(opt);
            });
        }

        // Update 3D rotation slider and degree value
        const rotDeg = Math.round(((node.rotY || 0) * 180 / Math.PI) % 360);
        const normDeg = rotDeg < 0 ? rotDeg + 360 : rotDeg;
        const slider = document.getElementById("node-rot-slider");
        if (slider) slider.value = normDeg;
        const valDisp = document.getElementById("node-rot-val");
        if (valDisp) valDisp.textContent = `${normDeg}°`;
    }
}

function updatePreviewCable() {
    if (previewCableMesh) scene.remove(previewCableMesh);
    if (!mouseHoverPoint || state.customPoints.length === 0) return;

    const lastPt = state.customPoints[state.customPoints.length - 1];
    const lastRoofY = getRoofHeightAt(lastPt.x, lastPt.z);

    const slopeRad = (state.roofSlope || 0) * (Math.PI / 180);
    let rotX = 0;
    if (state.roofShape === "sloped") {
        rotX = -slopeRad;
    } else if (state.roofShape === "triangle") {
        const halfW = state.l / 2;
        if (Math.abs(lastPt.z - halfW) < 0.05) {
            rotX = 0;
        } else {
            rotX = (lastPt.z < halfW) ? -slopeRad : slopeRad;
        }
    }

    const postH = 0.54;
    const topY = lastPt.y + lastRoofY + postH * Math.cos(rotX);
    const topZ = lastPt.z + postH * Math.sin(rotX);

    const points = [
        new THREE.Vector3(lastPt.x, topY, topZ),
        mouseHoverPoint
    ];
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
        color: 0x0f172a,
        dashSize: 0.2,
        gapSize: 0.1
    });
    previewCableMesh = new THREE.Line(geom, mat);
    previewCableMesh.computeLineDistances();
    scene.add(previewCableMesh);
}

function onWindowResize() {
    const container = document.getElementById("canvas3d");
    if (!container || !renderer) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width || container.clientWidth || window.innerWidth;
    const height = rect.height || container.clientHeight || (window.innerHeight - 64);
    if (width <= 0 || height <= 0) return;

    const aspect = width / height;

    if (perspectiveCam) {
        perspectiveCam.aspect = aspect;
        perspectiveCam.updateProjectionMatrix();
    }

    if (orthographicCam) {
        const d = Math.max(state.L || 21, state.l || 12);
        orthographicCam.left = -d * aspect;
        orthographicCam.right = d * aspect;
        orthographicCam.top = d;
        orthographicCam.bottom = -d;
        orthographicCam.updateProjectionMatrix();
    }

    renderer.setSize(width, height, false);
}

// Schedule smooth frame updates on window resize
window.addEventListener("resize", () => {
    onWindowResize();
    requestAnimationFrame(() => onWindowResize());
});

let calloutPositions3D = {};

// Procedural Fallen Worker Mannequin Avatar in Full OSHA Safety Gear
function createFallenWorkerMesh() {
    const group = new THREE.Group();
    
    // Materials
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.5 });
    const suitMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
    const harnessMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2, metalness: 0.3 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.1 });

    // 1. Head (Sphere + Helmet)
    const headGroup = new THREE.Group();
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 16), skinMat);
    headMesh.position.y = 1.58;
    headGroup.add(headMesh);

    const helmetMesh = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), helmetMat);
    helmetMesh.position.y = 1.59;
    headGroup.add(helmetMesh);
    group.add(headGroup);

    // 2. Torso (Body + Harness)
    const torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.60, 16), suitMat);
    torsoMesh.position.y = 1.20;
    group.add(torsoMesh);

    // Harness Straps on torso
    const strap1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.61, 0.28), harnessMat);
    strap1.position.set(0, 1.20, 0);
    group.add(strap1);

    // Harness D-Ring on back of shoulders
    const dRing = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 10, 16), metalMat);
    dRing.position.set(0, 1.38, -0.15);
    dRing.rotation.x = Math.PI / 2;
    group.add(dRing);

    // 3. Arms (Hanging suspended)
    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.50, 12), suitMat);
    leftArm.position.set(-0.22, 1.15, 0);
    leftArm.rotation.z = Math.PI / 12;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.50, 12), suitMat);
    rightArm.position.set(0.22, 1.15, 0);
    rightArm.rotation.z = -Math.PI / 12;
    group.add(rightArm);

    // 4. Legs (Hanging suspended)
    const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.65, 12), suitMat);
    leftLeg.position.set(-0.09, 0.52, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.65, 12), suitMat);
    rightLeg.position.set(0.09, 0.52, 0);
    group.add(rightLeg);

    // Boots
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.10, 0.14), bootMat);
    leftBoot.position.set(-0.09, 0.12, 0.02);
    group.add(leftBoot);

    const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.10, 0.14), bootMat);
    rightBoot.position.set(0.09, 0.12, 0.02);
    group.add(rightBoot);

    group.userData.dRingRelPos = new THREE.Vector3(0, 1.38, -0.15);

    return group;
}

let calloutData = {};

function formatLengthOdin(meters, isEn = (parseInt(state.lang) === 1)) {
    if (meters === null || meters === undefined || isNaN(meters)) return "--";
    if (isEn) {
        const totalInches = Math.round(meters * 39.37007874);
        const feet = Math.floor(totalInches / 12);
        const remInches = Math.round(totalInches % 12);
        return `${feet}' ${remInches}"`;
    }
    return `${meters.toFixed(2).replace('.', ',')} m`;
}

function update3DCalloutsOverlay() {
    const container = document.getElementById("canvas-overlay");
    if (container) {
        container.style.display = "none";
        container.innerHTML = "";
    }
    return;
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) {
        controls.update();
    }
    if (renderer && scene && activeCam) {
        renderer.render(scene, activeCam);
        update3DCalloutsOverlay();
    }
}

// Helper: Prepare loaded OBJ model with Z-up to Y-up orientation, 45° offset for NEW PRO / LIGHT PRO, scaling, material, and bottom Y alignment
function prepareOBJModel(rawObj, rotY, modelFile = null) {
    const wrapper = new THREE.Group();
    const clone = rawObj.clone();

    // Rotate CAD model: X and Z axis orientation adjustments for specific models
    if (modelFile && (modelFile.includes("LongRange") || modelFile.includes("long_range") || modelFile.includes("Long_Range"))) {
        clone.rotation.x = Math.PI / 2; // Rotate 90° around X-axis strictly for Long Range models
        clone.rotation.z = 0;
    } else {
        clone.rotation.x = -Math.PI / 2; // Default vertical orientation for all other system models (NEW PRO, LIGHT PRO, etc.)
        clone.rotation.z = 0;
    }

    // High-visibility polished stainless steel / chrome material for all components
    const matColor = state.colors.anchors || "#f8fafc";
    const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(matColor),
        metalness: 0.92,
        roughness: 0.12,
        emissive: new THREE.Color(matColor),
        emissiveIntensity: 0.15,
        side: THREE.DoubleSide
    });

    clone.traverse(c => {
        if (c.isMesh) {
            c.material = mat;
            c.castShadow = true;
            c.receiveShadow = true;
        }
    });

    // Compute bounding box after Z-to-Y rotation
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());

    // Scale mm to meters if size is large (>10 units)
    let scaleFactor = 1.0;
    if (size.y > 10 || size.x > 10 || size.z > 10) {
        scaleFactor = 0.001;
    }

    if (scaleFactor !== 1.0) {
        clone.scale.set(scaleFactor, scaleFactor, scaleFactor);
        box.setFromObject(clone);
        box.getSize(size);
    }

    // Align top clamp head center (top 12% height) horizontally at X=0, Z=0 so cable passes 100% through matrix head on all models (including potelets)
    clone.updateMatrixWorld(true);
    let maxMeshY = -Infinity;
    clone.traverse(c => {
        if (c.isMesh) {
            const cBox = new THREE.Box3().setFromObject(c);
            if (cBox.max.y > maxMeshY) maxMeshY = cBox.max.y;
        }
    });

    const topBox = new THREE.Box3();
    const thresholdY = (maxMeshY !== -Infinity) ? Math.max(box.min.y + size.y * 0.5, maxMeshY - size.y * 0.12) : box.max.y - size.y * 0.12;

    clone.traverse(c => {
        if (c.isMesh) {
            const cBox = new THREE.Box3().setFromObject(c);
            if (cBox.max.y >= thresholdY) {
                topBox.union(cBox);
            }
        }
    });

    const isLongRangeModel = modelFile && (modelFile.includes("LongRange") || modelFile.includes("long_range") || modelFile.includes("Long_Range"));

    if (isLongRangeModel) {
        // Position the flat bottom tab of the A-Fix bracket flush on top of post plate at Y = 0 (Y_offset = +0.0600)
        // Center the A-Fix bracket foot tab dead-center over the post top plate (Z = +0.1482, X = 0)
        clone.position.set(0, 0.0600, 0.1482);
    } else if (modelFile && modelFile.includes("X-Cone")) {
        const coneCenter = box.getCenter(new THREE.Vector3());
        clone.position.set(-coneCenter.x, -coneCenter.y, -coneCenter.z);
    } else {
        const topCenter = topBox.isEmpty() ? box.getCenter(new THREE.Vector3()) : topBox.getCenter(new THREE.Vector3());
        clone.position.set(-topCenter.x, -box.min.y, -topCenter.z);
    }

    // Apply base Y-axis rotation offset for NEW PRO & LIGHT PRO models
    const isNewOrLightPro = modelFile ? (modelFile.includes("new_pro") || modelFile.includes("light_pro")) : (state.product === "NEW PRO" || state.product === "LIGHT PRO");
    let angleOffset = isNewOrLightPro ? (Math.PI / 2) : 0;

    // Additional Y-axis rotation offsets for specific models
    if (modelFile) {
        if (modelFile.includes("Mini_Omega") || modelFile.includes("X-Cone") || modelFile.includes("P_Inox") || modelFile.includes("P_Galva") || modelFile.includes("P_Glava") || modelFile.includes("PB_HOOKT") || modelFile.includes("PB_HOOKt") || modelFile.includes("PB_")) {
            angleOffset += Math.PI / 2;
        } else if (modelFile.includes("LongRange") || modelFile.includes("long_range") || modelFile.includes("Long_Range")) {
            angleOffset += Math.PI / 2;
        }
    }

    const rotGroup = new THREE.Group();
    rotGroup.rotation.y = rotY + angleOffset;
    rotGroup.add(clone);

    wrapper.add(rotGroup);

    // Save actual model height for precise cable attachment
    if (isLongRangeModel) {
        wrapper.userData.height = 0.096; // Cable eyelet alignment offset for Long Range (aligns cable 100% through maillon eyelet)
    } else {
        wrapper.userData.height = (size.y > 0.05 && size.y < 3.0) ? size.y : 0.45;
    }

    return wrapper;
}

function createHighPostMesh() {
    const group = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.8,
        roughness: 0.3
    });
    const plateMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.85,
        roughness: 0.25
    });

    // Base plate (0.35m x 0.35m x 0.02m)
    const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.35), plateMat);
    basePlate.position.y = 0.01;
    group.add(basePlate);

    // High vertical tubular column (2.5m height)
    const columnGeom = new THREE.CylinderGeometry(0.065, 0.065, 2.5, 16);
    const column = new THREE.Mesh(columnGeom, postMat);
    column.position.y = 1.27;
    group.add(column);

    // Top flange mounting plate
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, 0.25), plateMat);
    topPlate.position.y = 2.53;
    group.add(topPlate);

    group.userData.height = 2.54;
    return group;
}

// Procedural Fallback 3D Anchor Post Mesh (Renders clean 3D post when no GLB model is checked)
function createProceduralAnchorMesh(colorHex) {
    const group = new THREE.Group();
    const matMetal = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorHex || state.colors.anchors || "#f8fafc"),
        metalness: 0.9,
        roughness: 0.15
    });

    // Base plate
    const plateGeo = new THREE.BoxGeometry(0.18, 0.015, 0.18);
    const plateMesh = new THREE.Mesh(plateGeo, matMetal);
    plateMesh.position.y = 0.0075;
    group.add(plateMesh);

    // Vertical post tube
    const postGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.42, 16);
    const postMesh = new THREE.Mesh(postGeo, matMetal);
    postMesh.position.y = 0.225;
    group.add(postMesh);

    // Top matrix clamp head / eyelet ring
    const headGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 16);
    const headMesh = new THREE.Mesh(headGeo, matMetal);
    headMesh.position.y = 0.44;
    group.add(headMesh);

    const eyeletGeo = new THREE.TorusGeometry(0.02, 0.006, 10, 16);
    const eyeletMesh = new THREE.Mesh(eyeletGeo, matMetal);
    eyeletMesh.position.y = 0.46;
    eyeletMesh.rotation.x = Math.PI / 2;
    group.add(eyeletMesh);

    group.userData.height = 0.46;
    return group;
}

// Real OBJ 3D Anchor Post Mesh Creator (Renders all checked models for a node position in 3D)
function createAnchorMesh(colorHex, nodeType = "intermediaire", compId = null, rotY = 0, targetCableHeight = null) {
    const list = COMPONENTS_DB[state.product] || [];
    const mainGroup = new THREE.Group();
    const filesToRender = [];

    // 1. If explicit compId is defined on the node and checked in sidebar
    if (compId) {
        const match = list.find(c => c.id === compId && c.checked);
        if (match) filesToRender.push(match.file);
    }

    // 2. Otherwise check which components in COMPONENTS_DB are checked for active product
    if (filesToRender.length === 0) {
        if (nodeType === "x_matrix") {
            const checkedPosts = list.filter(c => c.id !== "Contre_Plaque" && c.id !== "X-Cone" && c.id !== "Pack_Matrix" && c.id !== "X-Matrix" && c.id !== "New_Pro" && c.id !== "LightPro" && c.id !== "LongRange" && c.checked);
            checkedPosts.forEach(c => filesToRender.push(c.file));
            const xmat = list.find(c => c.id === "X-Matrix" && c.checked);
            if (xmat) {
                filesToRender.push(xmat.file);
            } else if (checkedPosts.length === 0) {
                const defaultXmat = list.find(c => c.id === "X-Matrix");
                if (defaultXmat) filesToRender.push(defaultXmat.file);
            }
        } else if (nodeType === "extremite") {
            // For LONG RANGE, require BOTH Absorber (LongRange) AND Anchor (A-Fix) to be checked to render 3D model
            if (state.product === "LONG RANGE") {
                const lrAbsorber = list.find(c => c.id === "LongRange");
                const afixAnchor = list.find(c => c.id === "A-Fix");
                if (lrAbsorber && lrAbsorber.checked && afixAnchor && afixAnchor.checked) {
                    filesToRender.push(lrAbsorber.file || "models/long_range/LongRange.glb");
                }
            } else {
                // Include checked posts and absorbers for other products
                let checkedAbsorbers = list.filter(c => (c.id === "New_Pro" || c.id === "LightPro") && c.checked);
                let checkedPosts = list.filter(c => c.id !== "Contre_Plaque" && c.id !== "X-Cone" && c.id !== "Pack_Matrix" && c.id !== "X-Matrix" && c.id !== "New_Pro" && c.id !== "LightPro" && c.checked);

                checkedPosts.forEach(p => filesToRender.push(p.file));
                checkedAbsorbers.forEach(a => filesToRender.push(a.file));
            }
        } else {
            // Intermediate node post
            if (state.product === "LONG RANGE") {
                const lrAbsorber = list.find(c => c.id === "LongRange");
                const afixAnchor = list.find(c => c.id === "A-Fix");
                if (lrAbsorber && lrAbsorber.checked && afixAnchor && afixAnchor.checked) {
                    filesToRender.push(lrAbsorber.file || "models/long_range/LongRange.glb");
                }
            } else {
                let checkedAbsorbers = list.filter(c => (c.id === "New_Pro" || c.id === "LightPro") && c.checked);
                let checkedPosts = list.filter(c => c.id !== "Contre_Plaque" && c.id !== "X-Cone" && c.id !== "Pack_Matrix" && c.id !== "X-Matrix" && c.id !== "New_Pro" && c.id !== "LightPro" && c.checked);

                checkedPosts.forEach(p => filesToRender.push(p.file));
                if (checkedPosts.length === 0) {
                    checkedAbsorbers.forEach(a => filesToRender.push(a.file));
                }
            }
        }
    }

    let currentBaseY = 0.0;
    let totalHeight = 0.0;

    const isOverheadMode = (state.product === "LONG RANGE") && (state.mountingType === "overhead" || state.roofShape === "flat_overhead");
    const isPoteauHautChecked = (state.product === "LONG RANGE") && list.some(c => c.id === "Poteau_Haut" && c.checked);

    if (isOverheadMode || isPoteauHautChecked) {
        const highPostObj = createHighPostMesh();
        mainGroup.add(highPostObj);
        currentBaseY += highPostObj.userData.height;
        totalHeight += highPostObj.userData.height;
    }

    // Filter and deduplicate valid GLB/OBJ files to render
    const validFilesToRender = [...new Set(filesToRender.filter(f => f && typeof f === 'string'))];

    // If no component is explicitly checked by user and not overhead, render procedural fallback anchor post
    if (validFilesToRender.length === 0 && !isOverheadMode && !isPoteauHautChecked) {
        mainGroup.userData.height = 0.45;
        return mainGroup;
    }

    // Separate post base components from top matrix / junction components
    const isTopComponent = (f) => f && typeof f === "string" && (f.includes("New_Pro.glb") || f.includes("LightPro.glb") || f.includes("LongRange.glb") || f.includes("X-Matrix.glb"));
    const postFiles = validFilesToRender.filter(f => !isTopComponent(f));
    const topFiles = validFilesToRender.filter(f => isTopComponent(f));

    // Render post base components first at Y = 0
    postFiles.forEach(file => {
        if (file && objCache[file]) {
            const modelObj = prepareOBJModel(objCache[file], rotY, file);
            modelObj.position.y = currentBaseY;
            const h = modelObj.userData.height || 0.30;
            currentBaseY += h;
            totalHeight += h;
            mainGroup.add(modelObj);
        } else if (file) {
            loadOBJModel(file).then(() => {
                if (typeof update3DScene === "function") update3DScene();
            });
        }
    });

    // If no post base components were rendered:
    // Standalone absorbers (New_Pro, LightPro, LongRange) sit directly on the roof surface (Y = 0.0).
    // Mid-span junction (X-Matrix) without a post base attaches at cable line height.
    if (postFiles.length === 0 && topFiles.length > 0 && !isOverheadMode && !isPoteauHautChecked) {
        const isMatrixOnly = topFiles.every(f => f.includes("X-Matrix.glb"));
        if (isMatrixOnly) {
            const defaultHeight = targetCableHeight || 0.45;
            currentBaseY = Math.max(0.05, defaultHeight - 0.035);
        } else {
            currentBaseY = 0.0;
        }
    }

    // Render top matrix/junction components (X-Matrix, New_Pro absorber, etc.) on top of post base (or at cable height)
    topFiles.forEach(file => {
        if (file && objCache[file]) {
            const modelObj = prepareOBJModel(objCache[file], rotY, file);
            modelObj.position.y = currentBaseY;
            const h = modelObj.userData.height || 0.05;
            totalHeight += h;
            mainGroup.add(modelObj);
        } else if (file) {
            loadOBJModel(file).then(() => {
                if (typeof update3DScene === "function") update3DScene();
            });
        }
    });

    mainGroup.userData.height = totalHeight > 0.05 ? totalHeight : 0.45;
    return mainGroup;
}

// Helper: Calculate exact Roof Height at any (x, z) coordinate
function getRoofHeightAt(x, z) {
    const slopeRad = (state.roofSlope || 0) * (Math.PI / 180);
    if (state.roofShape === "sloped") {
        return Math.max(0, z * Math.tan(slopeRad));
    } else if (state.roofShape === "triangle") {
        const ridgeW = 0.6;
        const slopeZ = Math.max(0, (state.l - ridgeW) / 2);
        const flatH = slopeZ * Math.tan(slopeRad);
        const arcH = 0.05;

        if (z < slopeZ) {
            return Math.max(0, z * Math.tan(slopeRad));
        } else if (z > state.l - slopeZ) {
            return Math.max(0, (state.l - z) * Math.tan(slopeRad));
        } else {
            const t = (z - slopeZ) / ridgeW;
            return flatH + 4 * arcH * t * (1 - t);
        }
    }
    return 0.0;
}

// Render Roof Skylights / Lanterneaux
function createSkylightsObstacles(L, l) {
    while (obstacleGroup.children.length > 0) {
        obstacleGroup.remove(obstacleGroup.children[0]);
    }

    if (!state.showObstacles) return;

    const kerbMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, transparent: true, opacity: 0.7, roughness: 0.1 });

    const sky1 = new THREE.Group();
    const kerb1 = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.4, 2.0), kerbMat);
    kerb1.position.y = 0.2;
    const top1 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 1.8), glassMat);
    top1.position.y = 0.45;
    sky1.add(kerb1); sky1.add(top1);
    const sky1RoofY = getRoofHeightAt(L * 0.25, l * 0.7);
    sky1.position.set(L * 0.25, sky1RoofY, l * 0.7);
    obstacleGroup.add(sky1);

    const sky2 = new THREE.Group();
    const kerb2 = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.4, 2.0), kerbMat);
    kerb2.position.y = 0.2;
    const top2 = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.1, 1.8), glassMat);
    top2.position.y = 0.45;
    sky2.add(kerb2); sky2.add(top2);
    const sky2RoofY = getRoofHeightAt(L * 0.65, l * 0.7);
    sky2.position.set(L * 0.65, sky2RoofY, l * 0.7);
    obstacleGroup.add(sky2);
}

// Build 3D Volumetric Roof Mesh according to Roof Shape
function create3DRoofShape(L, l, roofMat) {
    const shape = state.roofShape;
    const slopeRad = (state.roofSlope || 0) * (Math.PI / 180);
    const roofGroup = new THREE.Group();

    // Dark edge outline for crisp 3D shape visibility
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x0f172a });

    if (shape === "sloped") {
        const l_slope = l / Math.cos(slopeRad);
        const roofGeo = new THREE.BoxGeometry(L, 0.2, l_slope);
        const mesh = new THREE.Mesh(roofGeo, roofMat);
        mesh.rotation.x = -slopeRad;
        const midY = (l / 2) * Math.tan(slopeRad);
        const posY = midY - 0.1 * Math.cos(slopeRad);
        const posZ = (l / 2) + 0.1 * Math.sin(slopeRad);

        mesh.position.set(L / 2, posY, posZ);
        mesh.receiveShadow = true;
        roofGroup.add(mesh);

        const edges = new THREE.EdgesGeometry(roofGeo);
        const line = new THREE.LineSegments(edges, edgeMat);
        line.rotation.x = -slopeRad;
        line.position.set(L / 2, posY, posZ);
        roofGroup.add(line);

        return roofGroup;
    } else if (shape === "triangle") {
        const ridgeW = 0.6;
        const slopeZ = Math.max(0, (l - ridgeW) / 2);
        const flatH = slopeZ * Math.tan(slopeRad);
        const arcH = 0.05;
        const thick = 0.20;

        const roofShape2D = new THREE.Shape();
        roofShape2D.moveTo(0, 0);
        roofShape2D.lineTo(slopeZ, flatH);
        roofShape2D.quadraticCurveTo(l / 2, flatH + 2 * arcH, l - slopeZ, flatH);
        roofShape2D.lineTo(l, 0);
        roofShape2D.lineTo(l, -thick);
        roofShape2D.lineTo(l - slopeZ, flatH - thick);
        roofShape2D.quadraticCurveTo(l / 2, flatH + 2 * arcH - thick, slopeZ, flatH - thick);
        roofShape2D.lineTo(0, -thick);
        roofShape2D.closePath();

        const extrudeSettings = {
            steps: 1,
            depth: L,
            bevelEnabled: false,
            curveSegments: 32
        };

        const gabledGeo = new THREE.ExtrudeGeometry(roofShape2D, extrudeSettings);
        gabledGeo.rotateY(-Math.PI / 2);
        gabledGeo.translate(L, 0, 0);

        const gabledMesh = new THREE.Mesh(gabledGeo, roofMat);
        gabledMesh.receiveShadow = true;
        roofGroup.add(gabledMesh);

        const edges = new THREE.EdgesGeometry(gabledGeo, 20);
        const edgeLine = new THREE.LineSegments(edges, edgeMat);
        roofGroup.add(edgeLine);

        return roofGroup;
    }

    // Flat roof slab with thick 3D volumetric block (4.5m height) and dark edge outline matching Image 1
    const roofH = state.roofHeight || 4.5;
    const matTop = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.75, metalness: 0.1 });
    const matSide = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.65, metalness: 0.1 });
    const roofMaterials = [matSide, matSide, matTop, matSide, matSide, matSide];

    const roofGeo = new THREE.BoxGeometry(L, roofH, l);
    const roofMeshFlat = new THREE.Mesh(roofGeo, roofMaterials);
    roofMeshFlat.position.set(L / 2, -roofH / 2, l / 2);
    roofMeshFlat.receiveShadow = true;
    roofGroup.add(roofMeshFlat);

    const edgeMatFlat = new THREE.LineBasicMaterial({ color: 0x0f172a, linewidth: 2 });
    const edgesFlat = new THREE.EdgesGeometry(roofGeo);
    const lineFlat = new THREE.LineSegments(edgesFlat, edgeMatFlat);
    lineFlat.position.set(L / 2, -roofH / 2, l / 2);
    roofGroup.add(lineFlat);

    return roofGroup;
}

// 3D Procedural Cable End Loop Terminal with Crimped Sleeves (Manchons de sertissage)
function createCableLoopTerminal(pos, dir, cableColorHex, isMatrixJunction = false) {
    const group = new THREE.Group();
    const compColor = cableColorHex || state.colors.cable || "#f8fafc";
    const matCable = new THREE.MeshStandardMaterial({
        color: new THREE.Color(compColor),
        metalness: 0.92,
        roughness: 0.12,
        emissive: new THREE.Color(compColor),
        emissiveIntensity: 0.15
    });
    const matSleeve = new THREE.MeshStandardMaterial({
        color: new THREE.Color(compColor),
        metalness: 0.95,
        roughness: 0.10,
        emissive: new THREE.Color(compColor),
        emissiveIntensity: 0.15
    });

    const sleeveLength = 0.08;
    const sleeveRadius = 0.015;
    const cableR = 0.0075;
    const offset = 0.0065;

    if (isMatrixJunction) {
        // Crimp sleeve positioned outside the X-Matrix arm slot (from z = 0.025 to z = 0.105)
        const sleeveZStart = 0.025;
        const sleeveZCenter = sleeveZStart + sleeveLength / 2;

        const sleeveGeo = new THREE.CylinderGeometry(sleeveRadius, sleeveRadius, sleeveLength, 16);
        const sleeveMesh = new THREE.Mesh(sleeveGeo, matSleeve);
        sleeveMesh.position.set(0, 0, sleeveZCenter);
        sleeveMesh.rotation.x = Math.PI / 2;
        group.add(sleeveMesh);

        // 3 Stamped Crimp Rings on sleeve
        const numRings = 3;
        for (let r = 1; r <= numRings; r++) {
            const ringGeo = new THREE.TorusGeometry(sleeveRadius + 0.002, 0.0025, 10, 20);
            const ringMesh = new THREE.Mesh(ringGeo, matSleeve);
            const ringZ = sleeveZStart + (r * sleeveLength) / (numRings + 1);
            ringMesh.position.set(0, 0, ringZ);
            group.add(ringMesh);
        }

        // Two parallel cable strands inside sleeve
        const cGeo = new THREE.CylinderGeometry(cableR, cableR, sleeveLength, 10);
        const c1 = new THREE.Mesh(cGeo, matCable);
        c1.position.set(-offset, 0, sleeveZCenter);
        c1.rotation.x = Math.PI / 2;
        group.add(c1);

        const c2 = new THREE.Mesh(cGeo, matCable);
        c2.position.set(offset, 0, sleeveZCenter);
        c2.rotation.x = Math.PI / 2;
        group.add(c2);

        // Teardrop Cable Loop passing THROUGH the X-Matrix arm slot at z = 0
        const loopWidth = 0.020;
        const pts = [
            new THREE.Vector3(-offset, 0, sleeveZStart),
            new THREE.Vector3(-loopWidth, 0, 0.01),
            new THREE.Vector3(-loopWidth * 0.8, 0, -0.025),
            new THREE.Vector3(0, 0, -0.035),
            new THREE.Vector3(loopWidth * 0.8, 0, -0.025),
            new THREE.Vector3(loopWidth, 0, 0.01),
            new THREE.Vector3(offset, 0, sleeveZStart)
        ];

        const loopCurve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
        const loopGeo = new THREE.TubeGeometry(loopCurve, 32, cableR, 10, false);
        const loopMesh = new THREE.Mesh(loopGeo, matCable);
        group.add(loopMesh);
    } else {
        // Standard extremity loop terminal
        const sleeveGeo = new THREE.CylinderGeometry(sleeveRadius, sleeveRadius, sleeveLength, 16);
        const sleeveMesh = new THREE.Mesh(sleeveGeo, matSleeve);
        sleeveMesh.position.set(0, 0, sleeveLength / 2);
        sleeveMesh.rotation.x = Math.PI / 2;
        group.add(sleeveMesh);

        const numRings = 3;
        for (let r = 1; r <= numRings; r++) {
            const ringGeo = new THREE.TorusGeometry(sleeveRadius + 0.002, 0.0025, 10, 20);
            const ringMesh = new THREE.Mesh(ringGeo, matSleeve);
            const ringZ = (r * sleeveLength) / (numRings + 1);
            ringMesh.position.set(0, 0, ringZ);
            group.add(ringMesh);
        }

        const cGeo = new THREE.CylinderGeometry(cableR, cableR, sleeveLength, 10);
        const c1 = new THREE.Mesh(cGeo, matCable);
        c1.position.set(-offset, 0, sleeveLength / 2);
        c1.rotation.x = Math.PI / 2;
        group.add(c1);

        const c2 = new THREE.Mesh(cGeo, matCable);
        c2.position.set(offset, 0, sleeveLength / 2);
        c2.rotation.x = Math.PI / 2;
        group.add(c2);

        const loopLength = 0.12;
        const loopWidth = 0.032;
        const pts = [
            new THREE.Vector3(-offset, 0, sleeveLength),
            new THREE.Vector3(-loopWidth, 0, sleeveLength + loopLength * 0.35),
            new THREE.Vector3(-loopWidth * 0.7, 0, sleeveLength + loopLength * 0.85),
            new THREE.Vector3(0, 0, sleeveLength + loopLength),
            new THREE.Vector3(loopWidth * 0.7, 0, sleeveLength + loopLength * 0.85),
            new THREE.Vector3(loopWidth, 0, sleeveLength + loopLength * 0.35),
            new THREE.Vector3(offset, 0, sleeveLength)
        ];

        const loopCurve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
        const loopGeo = new THREE.TubeGeometry(loopCurve, 32, cableR, 10, false);
        const loopMesh = new THREE.Mesh(loopGeo, matCable);
        group.add(loopMesh);
    }

    // Orient and position terminal group along dir
    group.position.copy(pos);

    const unitDir = dir.clone().normalize();
    const defaultDir = new THREE.Vector3(0, 0, 1);
    const quat = new THREE.Quaternion().setFromUnitVectors(defaultDir, unitDir);
    group.quaternion.copy(quat);

    return group;
}

// X-Matrix stopper pin removed

// 3D Procedural Deployed Lanyard with Tear-Webbing Energy Absorber (EA Deploy) matching reference image
function createDeployedLanyardMesh(cableApexPoint, edgePt, dRingWorldPos) {
    const group = new THREE.Group();

    // Materials
    const matKarabiner = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95, roughness: 0.15 });
    const matStrap = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8, metalness: 0.1 });
    const matBlueEa = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.4, metalness: 0.1 }); // Blue deployed absorber matching reference image
    const matYellowTag = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5, metalness: 0.1 }); // Safety warning label tag
    const matTearWebbing = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6, metalness: 0.1 }); // Unfolded tear webbing ribbon

    // 1. Top Karabiner Slider / Shuttle on Lifeline Cable Apex
    const shuttleGeo = new THREE.TorusGeometry(0.025, 0.006, 12, 24);
    const shuttleMesh = new THREE.Mesh(shuttleGeo, matKarabiner);
    shuttleMesh.position.copy(cableApexPoint);
    group.add(shuttleMesh);

    // 2. Horizontal Lanyard Segment running ON TOP of Roof Surface from cable apex to roof edge
    if (cableApexPoint.z > 0.05) {
        const roofLanyardCurve = new THREE.LineCurve3(cableApexPoint, edgePt);
        const roofLanyardGeo = new THREE.TubeGeometry(roofLanyardCurve, 8, 0.008, 8, false);
        group.add(new THREE.Mesh(roofLanyardGeo, matStrap));

        // Corner Edge Guide / Karabiner at Roof Edge
        const edgeGuideGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.06, 12);
        const edgeGuideMesh = new THREE.Mesh(edgeGuideGeo, matKarabiner);
        edgeGuideMesh.position.copy(edgePt);
        edgeGuideMesh.rotation.z = Math.PI / 2;
        group.add(edgeGuideMesh);
    }

    // 3. Vertical Lanyard Segment & Deployed Energy Absorber (EA Deploy) hanging over the edge in front of facade
    const vertStartPt = (cableApexPoint.z > 0.05) ? edgePt.clone() : cableApexPoint.clone();
    const vertVector = dRingWorldPos.clone().sub(vertStartPt);
    const vertLen = vertVector.length();
    const dirVert = vertVector.clone().normalize();
    const defaultUp = new THREE.Vector3(0, 1, 0);
    const quatVert = new THREE.Quaternion().setFromUnitVectors(defaultUp, dirVert);

    // Upper Vertical Lanyard Rope (Free Fall segment - FF) ~ 30% of vertical distance
    const lenFF = vertLen * 0.30;
    const ptFF_End = vertStartPt.clone().add(dirVert.clone().multiplyScalar(lenFF));
    const ffCurve = new THREE.LineCurve3(vertStartPt, ptFF_End);
    const ffGeo = new THREE.TubeGeometry(ffCurve, 6, 0.008, 8, false);
    group.add(new THREE.Mesh(ffGeo, matStrap));

    // Middle Vertical Segment: Deployed Blue Energy Absorber (EA Deploy) ~ 50% of vertical distance
    const lenEA = vertLen * 0.50;
    const ptEA_Start = ptFF_End;
    const ptEA_End = ptEA_Start.clone().add(dirVert.clone().multiplyScalar(lenEA));
    const ptEA_Center = ptEA_Start.clone().add(ptEA_End).multiplyScalar(0.5);

    // Outer Blue Deployed Energy Absorber Sleeve (Cylinder)
    const eaBodyGeo = new THREE.CylinderGeometry(0.02, 0.02, lenEA, 16);
    const eaBodyMesh = new THREE.Mesh(eaBodyGeo, matBlueEa);
    eaBodyMesh.position.copy(ptEA_Center);
    eaBodyMesh.quaternion.copy(quatVert);
    group.add(eaBodyMesh);

    // Yellow Safety Inspection Tag
    const tagGeo = new THREE.CylinderGeometry(0.022, 0.022, lenEA * 0.2, 16);
    const tagMesh = new THREE.Mesh(tagGeo, matYellowTag);
    const ptTag = ptEA_Start.clone().add(dirVert.clone().multiplyScalar(lenEA * 0.15));
    tagMesh.position.copy(ptTag);
    tagMesh.quaternion.copy(quatVert);
    group.add(tagMesh);

    // Tear Webbing Ribbon
    const ribbonGeo = new THREE.BoxGeometry(0.004, lenEA * 0.85, 0.028);
    const ribbonMesh = new THREE.Mesh(ribbonGeo, matTearWebbing);
    ribbonMesh.position.copy(ptEA_Center);
    ribbonMesh.quaternion.copy(quatVert);
    group.add(ribbonMesh);

    // Lower Vertical Strap to D-Ring ~ 20%
    const lowerCurve = new THREE.LineCurve3(ptEA_End, dRingWorldPos);
    const lowerGeo = new THREE.TubeGeometry(lowerCurve, 6, 0.008, 8, false);
    group.add(new THREE.Mesh(lowerGeo, matStrap));

    // Harness D-Ring Karabiner Hook
    const dRingHook = new THREE.Mesh(shuttleGeo, matKarabiner);
    dRingHook.position.copy(dRingWorldPos);
    group.add(dRingHook);

    return group;
}

function update3DScene() {
    if (!scene) return;

    if (roofMesh) scene.remove(roofMesh);
    if (gridHelper) scene.remove(gridHelper);
    if (cableGroup) {
        while (cableGroup.children.length > 0) {
            const child = cableGroup.children[0];
            child.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material.dispose();
                }
            });
            cableGroup.remove(child);
        }
    }

    while (anchorGroup.children.length > 0) {
        anchorGroup.remove(anchorGroup.children[0]);
    }

    const maxSpan = Calculator.getMaxSpan(state.product);
    const layout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
    const positions = layout.all;

    const L = state.L;
    const l = state.l;

    let roofMatColor = new THREE.Color(0x475569);
    let roofRoughness = 0.7;
    let roofMetalness = 0.2;

    if (state.roofTexture === "concrete") {
        roofMatColor = new THREE.Color(0x64748b);
    } else if (state.roofTexture === "metal") {
        roofMatColor = new THREE.Color(0x334155);
        roofMetalness = 0.7;
    } else if (state.roofTexture === "bitumen") {
        roofMatColor = new THREE.Color(0x1e293b);
    }

    const roofMat = new THREE.MeshStandardMaterial({
        color: roofMatColor,
        roughness: roofRoughness,
        metalness: roofMetalness,
        side: THREE.DoubleSide
    });

    roofMesh = create3DRoofShape(L, l, roofMat);
    roofMesh.receiveShadow = true;
    scene.add(roofMesh);

    if (state.gridVisible) {
        const gridDim = Math.max(L, l) + 12;
        gridHelper = new THREE.GridHelper(gridDim, Math.round(gridDim), 0x3b82f6, 0x94a3b8);
        gridHelper.position.set(L / 2, 0.001, l / 2);
        scene.add(gridHelper);
    }

    // Stop here if user has not yet chosen a HOOKT system
    if (!state.product) {
        return;
    }

    createSkylightsObstacles(L, l);

    const line1TopPts = [];
    const line2TopPts = [];

    // Determine uniform cable post height across all nodes to ensure 100% level cable line touching anchor heads
    let activePostHeight = 0.45;
    const activeComps = COMPONENTS_DB[state.product] || [];
    const sampleAnchor = createAnchorMesh(state.colors.anchors, "intermediaire");
    if (sampleAnchor && sampleAnchor.userData && sampleAnchor.userData.height > 0.05) {
        activePostHeight = sampleAnchor.userData.height;
    }

    // Helper to process node lists
    function processNodes(nodesList, targetPtsArray) {
        nodesList.forEach((pos, idx) => {
            let rotY = pos.rotY;
            if (rotY === undefined && nodesList.length > 1) {
                let dx = 0, dz = 0;
                if (idx < nodesList.length - 1) {
                    dx = nodesList[idx + 1].x - pos.x;
                    dz = nodesList[idx + 1].z - pos.z;
                } else {
                    dx = pos.x - nodesList[idx - 1].x;
                    dz = pos.z - nodesList[idx - 1].z;
                }
                rotY = Math.atan2(dz, dx);
            }

            // Orient extremity anchors in OPPOSITE directions strictly for LONG RANGE
            if ((state.product === "LONG RANGE" || (pos.compId && pos.compId.includes("LongRange"))) && idx === nodesList.length - 1 && nodesList.length > 1) {
                rotY = (rotY || 0) + Math.PI;
            }

            const roofY = getRoofHeightAt(pos.x, pos.z);
            const anchor = createAnchorMesh(state.colors.anchors, pos.type, pos.compId, rotY || 0, activePostHeight);

            const slopeRad = (state.roofSlope || 0) * (Math.PI / 180);
            let rotX = 0;
            if (state.roofShape === "sloped") {
                rotX = -slopeRad;
            } else if (state.roofShape === "triangle") {
                const ridgeW = 0.6;
                const halfW = state.l / 2;
                if (Math.abs(pos.z - halfW) <= ridgeW / 2 + 0.1) {
                    rotX = 0;
                } else {
                    rotX = (pos.z < halfW) ? -slopeRad : slopeRad;
                }
            }

            const roofLift = (state.roofShape === "sloped" || state.roofShape === "triangle") ? 0.02 : 0.0;

            anchor.rotation.x = rotX;
            anchor.rotation.z = 0;
            anchor.position.set(pos.x, pos.y + roofY + roofLift, pos.z);
            anchorGroup.add(anchor);

            const cpComp = activeComps.find(c => c.id === "Contre_Plaque" && c.checked);
            if (cpComp && objCache[cpComp.file]) {
                const cpObj = prepareOBJModel(objCache[cpComp.file], rotY || 0, cpComp.file);
                cpObj.rotation.x = rotX;
                cpObj.position.set(pos.x, pos.y + roofY + roofLift, pos.z);
                anchorGroup.add(cpObj);
            }

            const packComp = activeComps.find(c => c.id === "Pack_Matrix" && c.checked);
            if (packComp && objCache[packComp.file]) {
                const packObj = prepareOBJModel(objCache[packComp.file], rotY || 0, packComp.file);
                packObj.rotation.x = rotX;
                packObj.position.set(pos.x, pos.y + roofY + roofLift + 0.02, pos.z);
                anchorGroup.add(packObj);
            }

            // Uniform cable height passing 100% straight through top clamp head of posts
            const postH = Math.max(0.05, activePostHeight - 0.035);

            const topY = pos.y + roofY + roofLift + postH * Math.cos(rotX);
            const topZ = pos.z + postH * Math.sin(rotX);

            targetPtsArray.push(new THREE.Vector3(pos.x, topY, topZ));
        });
    }

    // Render X-CONE safety elements ON the cable at 1.0m (15°-30°) or 0.5m (30°-40°) intervals (STRICTLY when selected by user)
    function renderXConesAlongCable(ptsArray) {
        const list = COMPONENTS_DB[state.product] || [];
        const xconeComp = list.find(c => c.id === "X-Cone");
        const isChecked = xconeComp && xconeComp.checked;

        if (!isChecked) return;
        if (!xconeComp || !objCache[xconeComp.file]) return;

        const spacing = Calculator.getXConeSpacing();
        if (spacing <= 0) return;

        for (let i = 0; i < ptsArray.length - 1; i++) {
            const pA = ptsArray[i];
            const pB = ptsArray[i + 1];
            const dir = pB.clone().sub(pA);
            const segLen = dir.length();
            if (segLen < spacing) continue;

            const unitDir = dir.clone().normalize();
            const count = Math.floor(segLen / spacing);

            for (let k = 1; k <= count; k++) {
                const dist = k * spacing;
                if (dist > segLen - 0.2) break;

                const posCone = pA.clone().add(unitDir.clone().multiplyScalar(dist));
                const coneObj = prepareOBJModel(objCache[xconeComp.file], 0, xconeComp.file);
                coneObj.position.copy(posCone);

                // Orient cone tip pointing DOWNWARDS along the cable slope (-unitDir)
                const downDir = unitDir.clone().negate();
                const rotMatrix = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), downDir, new THREE.Vector3(0, 1, 0));
                coneObj.quaternion.setFromRotationMatrix(rotMatrix);

                anchorGroup.add(coneObj);
            }
        }
    }

    processNodes(layout.line1, line1TopPts);
    renderXConesAlongCable(line1TopPts);

    const cableExt = (state.product === "LONG RANGE") ? 0.30 : 0.20;

    if (state.hasLine2 && layout.line2.length > 0) {
        // END CORNER JUNCTION: Single continuous curved cable bending around corner
        processNodes(layout.line2, line2TopPts);
        renderXConesAlongCable(line2TopPts);

        if (line1TopPts.length > 0 && line2TopPts.length > 0) {
            const fullPathCombined = [];
            const p0 = line1TopPts[0];
            const p1 = line1TopPts.length > 1 ? line1TopPts[1] : line2TopPts[0];
            const vStart = p0.clone().sub(p1).normalize();
            const startExt = p0.clone().add(vStart.multiplyScalar(cableExt));

            fullPathCombined.push(startExt);
            line1TopPts.forEach(pt => fullPathCombined.push(pt));

            // Sample points along a clean circular arc between Post 1 (end of Line 1) and Post 2 (start of Line 2)
            const post1Pt = line1TopPts[line1TopPts.length - 1];
            const post2Pt = line2TopPts[0];
            if (post1Pt && post2Pt) {
                const cornerX = post2Pt.x;
                const cornerZ = post1Pt.z;
                const R = Math.abs(cornerX - post1Pt.x);

                const numArcSamples = 10;
                for (let step = 1; step < numArcSamples; step++) {
                    const t = step / numArcSamples;
                    const theta = t * (Math.PI / 2);
                    const arcX = (cornerX - R) + R * Math.sin(theta);
                    const arcZ = (cornerZ + R) - R * Math.cos(theta);
                    fullPathCombined.push(new THREE.Vector3(arcX, post1Pt.y, arcZ));
                }
            }

            line2TopPts.forEach(pt => fullPathCombined.push(pt));

            const endL2 = line2TopPts[line2TopPts.length - 1];
            const prevL2 = line2TopPts.length > 1 ? line2TopPts[line2TopPts.length - 2] : line1TopPts[line1TopPts.length - 1];
            const vEnd2 = endL2.clone().sub(prevL2).normalize();
            const endExt2 = endL2.clone().add(vEnd2.multiplyScalar(cableExt));

            fullPathCombined.push(endExt2);

            const curveCombined = new THREE.CatmullRomCurve3(fullPathCombined, false, 'catmullrom', 0.0);
            const tubeGeoCombined = new THREE.TubeGeometry(curveCombined, fullPathCombined.length * 12, 0.01, 8, false);
            const cableMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(state.colors.cable),
                metalness: 0.9,
                roughness: 0.1,
                emissive: new THREE.Color(state.colors.cable),
                emissiveIntensity: 0.2
            });
            const meshCombined = new THREE.Mesh(tubeGeoCombined, cableMat);
            cableGroup.add(meshCombined);

            // Add crimped cable end loops (boucles serties avec manchons)
            cableGroup.add(createCableLoopTerminal(startExt, vStart, state.colors.cable));
            cableGroup.add(createCableLoopTerminal(endExt2, vEnd2, state.colors.cable));
        }
    } else {
        // Straight Line 1 cable
        if (line1TopPts.length > 1) {
            const fullPath1 = [];
            const p0 = line1TopPts[0];
            const p1 = line1TopPts[1];
            const vStart = p0.clone().sub(p1).normalize();
            const startExt = p0.clone().add(vStart.multiplyScalar(cableExt));

            fullPath1.push(startExt);
            line1TopPts.forEach(pt => fullPath1.push(pt));

            const pn = line1TopPts[line1TopPts.length - 1];
            const pnPrev = line1TopPts[line1TopPts.length - 2];
            const vEnd = pn.clone().sub(pnPrev).normalize();
            const endExt = pn.clone().add(vEnd.multiplyScalar(cableExt));

            fullPath1.push(endExt);

            const curve1 = new THREE.CatmullRomCurve3(fullPath1, false, 'catmullrom', 0.05);
            const tubeGeo1 = new THREE.TubeGeometry(curve1, fullPath1.length * 12, 0.01, 8, false);
            const cableMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(state.colors.cable),
                metalness: 0.9,
                roughness: 0.1,
                emissive: new THREE.Color(state.colors.cable),
                emissiveIntensity: 0.2
            });
            const mesh1 = new THREE.Mesh(tubeGeo1, cableMat);
            cableGroup.add(mesh1);

            // Add crimped cable end loops (boucles serties avec manchons) for Line 1
            cableGroup.add(createCableLoopTerminal(startExt, vStart, state.colors.cable));
            cableGroup.add(createCableLoopTerminal(endExt, vEnd, state.colors.cable));
        }
    }

    // Render Fallen Worker Mannequin & Deflected Cable Sag ON THE ROOF + Lanyard over Edge ONLY when system pieces are selected
    let fallenWorkerGroup = null;
    const hasAnyCheckedComponent = activeComps.some(c => c.checked);
    const isSlopedRoof = (state.roofShape === "sloped");

    if (state.showFallSim && hasAnyCheckedComponent && line1TopPts.length > 1 && !isSlopedRoof) {
        const midIdx = Math.floor(line1TopPts.length / 2);
        const ptA = line1TopPts[Math.max(0, midIdx - 1)];
        const ptB = line1TopPts[Math.min(line1TopPts.length - 1, midIdx)];

        const sagPointCenter = ptA.clone().add(ptB).multiplyScalar(0.5);
        const realSpanMax = Calculator.calculateMaxRealSpan(layout);
        const deflMeters = Calculator.deflection(state.product, realSpanMax, state.fallFactor, getActiveSupportType(), state.nbUsers, state.norm, state.oshaSpanMode === "multi") / 1000.0;

        // Dynamic 3D deflection coordinates physically scaled to the calculated deflection (deflMeters):
        const sagZ = sagPointCenter.z - deflMeters;
        const sagY = sagPointCenter.y - (deflMeters * 0.45);
        
        // Apex point of cable on top of roof, clamped above roof surface height (+0.05m)
        const roofY_Apex = getRoofHeightAt(sagPointCenter.x, Math.max(0, sagZ)) + 0.05;
        const cableApexPoint = new THREE.Vector3(sagPointCenter.x, Math.max(roofY_Apex, sagY), sagZ);

        let sagPts = [];
        if (sagZ < 0) {
            // Deflection extends past the roof edge (Z < 0)
            const edgeX_A = ptA.x * 0.20 + sagPointCenter.x * 0.80;
            const edgeY_A = getRoofHeightAt(edgeX_A, 0.0) + 0.03;
            const edgePtA = new THREE.Vector3(edgeX_A, edgeY_A, 0.0);

            const edgeX_B = ptB.x * 0.20 + sagPointCenter.x * 0.80;
            const edgeY_B = getRoofHeightAt(edgeX_B, 0.0) + 0.03;
            const edgePtB = new THREE.Vector3(edgeX_B, edgeY_B, 0.0);

            sagPts = [ptA, edgePtA, cableApexPoint, edgePtB, ptB];
        } else {
            // Deflection is contained on top of the roof surface (Z >= 0)
            sagPts = [ptA, cableApexPoint, ptB];
        }

        const sagCurve = new THREE.CatmullRomCurve3(sagPts, false, 'catmullrom', sagZ < 0 ? 0.2 : 0.05);
        const sagTubeGeo = new THREE.TubeGeometry(sagCurve, 48, 0.012, 8, false);
        const sagMat = new THREE.MeshStandardMaterial({
            color: 0xef4444,
            metalness: 0.8,
            roughness: 0.2
        });
        const sagMesh = new THREE.Mesh(sagTubeGeo, sagMat);
        cableGroup.add(sagMesh);

        // Edge contact point on front roof edge (Z = 0.0)
        const edgeY_Front = getRoofHeightAt(sagPointCenter.x, 0.0) + 0.03;
        const edgePt = new THREE.Vector3(sagPointCenter.x, edgeY_Front, 0.0);

        // Render Fallen Worker Mannequin avatar hanging suspended in front of the front roof edge (Z = -0.15m)
        fallenWorkerGroup = createFallenWorkerMesh();
        const workerPosY = edgeY_Front - 2.20;
        const workerZ = Math.min(-0.15, sagZ < 0 ? sagZ : -0.15);
        fallenWorkerGroup.position.set(sagPointCenter.x, workerPosY, workerZ);
        cableGroup.add(fallenWorkerGroup);

        // Render Deployed Energy Absorber Lanyard (EA Deploy): Cable Apex -> Roof Edge -> Vertical EA Deploy -> Worker D-Ring
        const dRingWorldPos = new THREE.Vector3(sagPointCenter.x, workerPosY + 1.38, workerZ);
        const deployedLanyardGroup = createDeployedLanyardMesh(cableApexPoint, edgePt, dRingWorldPos);
        cableGroup.add(deployedLanyardGroup);

        // Store 3D world coordinates and calculation parameters for report generation
        const effortL = Calculator.effortLonge(state.product, realSpanMax, state.nbUsers, state.norm, state.fallFactor, getActiveSupportType(), state.oshaSpanMode === "multi");
        const deflL = Calculator.deflection(state.product, realSpanMax, state.fallFactor, getActiveSupportType(), state.nbUsers, state.norm, state.oshaSpanMode === "multi");
        const ext1L = Calculator.extremiteForce1(state.product, realSpanMax, state.nbUsers, state.norm, effortL, deflL, state.fallFactor, getActiveSupportType(), state.oshaSpanMode === "multi");
        const ext2L = Calculator.extremiteForce2(state.product, realSpanMax, state.nbUsers, state.norm, effortL, deflL, state.fallFactor, getActiveSupportType(), state.oshaSpanMode === "multi");
        const ext3L = Calculator.extremiteForce3(state.product, realSpanMax, state.nbUsers, state.norm, effortL, deflL, state.fallFactor, getActiveSupportType(), state.oshaSpanMode === "multi");

        const cpInches = Math.round(64.8 + (deflL / 25.4) + 24.0);

        const firstPt = (line1TopPts && line1TopPts.length > 0) ? line1TopPts[0] : null;
        calloutData = {
            mal1Lbf: Math.round(ext1L * 224.809),
            mal2Lbf: Math.round(ext2L * 224.809),
            milLbf: Math.round((ext3L || ext1L * 0.71) * 224.809),
            mafLbf: Math.round(effortL * 224.809),
            deflMeters: deflL / 1000.0,
            cpMeters: cpInches / 39.37007874,
            edMeters: state.edgeDistance,
            phMeters: state.roofHeight,
            shMeters: firstPt ? firstPt.y : 0.54
        };

        calloutPositions3D = {};
    } else {
        calloutPositions3D = {};
    }

    const centerX = L / 2;
    const centerZ = l / 2;
    controls.target.set(centerX, 0.2, centerZ);

    updateCalculationsUI(layout, maxSpan);
}

function getLocalizedRoofShapeName() {
    const l = state.lang || 0;
    const shape = state.roofShape;
    const slope = state.roofSlope || 0;
    if (shape === "flat") return ["Toit Plat", "Flat Roof", "Techo Plano"][l];
    if (shape === "flat_overhead") return ["Toit Plat (Overhead)", "Flat Roof (Overhead)", "Techo Plano (Overhead)"][l];
    if (shape === "sloped") return ["Toit Incliné", "Sloped Roof", "Techo Inclinado"][l] + ` (${slope}°)`;
    if (shape === "triangle") return ["Toit Triangulaire", "Gabled Roof", "Techo Triangular"][l] + ` (${slope}°)`;
    return ["Toit Plat", "Flat Roof", "Techo Plano"][l];
}

function formatLineMargin(marginCm) {
    const l = state.lang || 0;
    if (l === 1) {
        const marginIn = (marginCm * 0.3937007874).toFixed(2);
        return `(incl. 2×${marginIn} in free at ends)`;
    }
    if (l === 2) return `(incl. 2×${marginCm}cm libres en ext.)`;
    return `(dont 2×${marginCm}cm libres aux ext.)`;
}

// ==========================================
// REAL-TIME UI READOUTS UPDATE
// ==========================================
function updateCalculationsUI(layout, maxSpan) {
    const l = state.lang || 0;
    if (!state.product) {
        document.getElementById("val-fall-factor").textContent = state.fallFactor || 1;
        document.getElementById("val-max-allowed-span").textContent = formatDistance(null, 1, l);
        const lenElem = document.getElementById("val-total-line-len");
        if (lenElem) lenElem.textContent = formatDistance(state.lineLength || 15.0, 2, l);
        document.getElementById("val-span-l").textContent = formatDistance(null, 2, l);
        document.getElementById("val-force-l").textContent = "-- kN";
        const deflElem = document.getElementById("val-defl-l");
        if (deflElem) deflElem.textContent = formatDeflection(null, l);
        document.getElementById("val-ext1-l").textContent = "-- kN";
        document.getElementById("val-ext2-l").textContent = "-- kN";
        const lblAnchor = document.getElementById("lbl-anchor-count");
        if (lblAnchor) lblAnchor.textContent = TRANSLATIONS.lblAnchorCount[l];
        document.getElementById("val-anchor-count").textContent = "--";
        const lblAbsorber = document.getElementById("lbl-absorber-count");
        if (lblAbsorber) lblAbsorber.textContent = TRANSLATIONS.lblAbsorberCount[l];
        document.getElementById("val-absorber-count").textContent = "--";
        return;
    }

    const positions = (layout && layout.all) ? layout.all : (Array.isArray(layout) ? layout : []);
    const anchorPosts = positions.filter(p => p.type !== "x_matrix");
    const totalAnchors = anchorPosts.length > 0 ? anchorPosts.length : positions.length;
    const totalLineLen = Calculator.calculateTotalLineLength(layout, state.product);
    const realSpanMax = Calculator.calculateMaxRealSpan(layout);

    const warningElem = document.getElementById("canvas-warning");
    const warningTextElem = document.getElementById("warning-text");
    const isLongRange = (state.product === "LONG RANGE" || state.product === "LongRange");
    const isLongRangeInvalid = isLongRange && (state.lineLength < 10.0 || state.lineLength > 56.0 || realSpanMax > 56.0);

    if (isLongRangeInvalid) {
        if (warningTextElem) warningTextElem.textContent = ["Vous devez choisir une longueur de ligne entre 10 et 56 m", "You must choose a line length between 393.7 and 2204.72 in", "Debe elegir una longitud de línea entre 10 y 56 m"][l];
        if (warningElem) warningElem.classList.remove("hidden");

        const lblAnchor = document.getElementById("lbl-anchor-count");
        if (lblAnchor) lblAnchor.textContent = `${TRANSLATIONS.lblAnchorCount[l]} (${getActivePostName()})`;
        document.getElementById("val-anchor-count").textContent = "--";

        const lblAbsorber = document.getElementById("lbl-absorber-count");
        if (lblAbsorber) lblAbsorber.textContent = `${TRANSLATIONS.lblAbsorberCount[l]} (${state.product})`;
        document.getElementById("val-absorber-count").textContent = "--";

        document.getElementById("val-fall-factor").textContent = state.fallFactor;
        document.getElementById("val-max-allowed-span").textContent = formatDistance(maxSpan, 1, l);

        const lenElem = document.getElementById("val-total-line-len");
        if (lenElem) lenElem.textContent = `${formatDistance(totalLineLen, 2, l)} ${formatLineMargin(30)}`;

        document.getElementById("val-span-l").textContent = formatDistance(null, 2, l);
        document.getElementById("val-force-l").textContent = "-- kN";
        const deflElem = document.getElementById("val-defl-l");
        if (deflElem) deflElem.textContent = formatDeflection(null, l);
        document.getElementById("val-ext1-l").textContent = "-- kN";
        document.getElementById("val-ext2-l").textContent = "-- kN";

        const rowExt3 = document.getElementById("row-ext3");
        const rowExt4 = document.getElementById("row-ext4");
        if (rowExt3) rowExt3.style.display = "none";
        if (rowExt4) rowExt4.style.display = "none";

        const shapeName = getLocalizedRoofShapeName();
        const strL1 = formatDistance(state.lineLength, 2, l);
        const strL2 = formatDistance(state.line2Length, 2, l);
        document.getElementById("header-dims-display").innerHTML = `<i class="fa-solid fa-ruler-combined"></i> ${shapeName} | L1: ${strL1} ${state.hasLine2 ? `+ L2: ${strL2}` : ""}`;
        document.getElementById("header-system-display").textContent = state.product || ["Choisissez un système", "Choose a system", "Elija un sistema"][l];

        return;
    }

    if (warningTextElem) warningTextElem.textContent = TRANSLATIONS.warningText[l];

    const isOSHA = (state.norm === "OSHA");
    const isMultiSpanAllowed = isOSHA && (state.product === "NEW PRO" || state.product === "LIGHT PRO" || state.product === "LightPro");

    const oshaSubtabs = document.getElementById("osha-subtabs");
    if (oshaSubtabs) {
        oshaSubtabs.style.display = isMultiSpanAllowed ? "flex" : "none";
    }

    if (!isMultiSpanAllowed) {
        state.oshaSpanMode = "unique";
        const subtabUnique = document.getElementById("subtab-span-unique");
        const subtabMulti = document.getElementById("subtab-span-multi");
        if (subtabUnique) subtabUnique.classList.add("active");
        if (subtabMulti) subtabMulti.classList.remove("active");
    }

    let isMultiSpan = false;
    if (state.lineLength < 12.0) {
        isMultiSpan = false;
    } else if (isMultiSpanAllowed) {
        isMultiSpan = (state.oshaSpanMode === "multi");
    } else {
        isMultiSpan = false;
    }

    const support = getActiveSupportType();

    const effortL = Calculator.effortLonge(state.product, realSpanMax, state.nbUsers, state.norm, state.fallFactor, support, isMultiSpan);
    const deflL = Calculator.deflection(state.product, realSpanMax, state.fallFactor, support, state.nbUsers, state.norm, isMultiSpan);

    let ext1L = Calculator.extremiteForce1(state.product, realSpanMax, state.nbUsers, state.norm, effortL, deflL, state.fallFactor, support, isMultiSpan);
    let ext2L = Calculator.extremiteForce2(state.product, realSpanMax, state.nbUsers, state.norm, effortL, deflL, state.fallFactor, support, isMultiSpan);

    const isSlopedRoof = (state.roofShape === "sloped");
    const rowAngleFinal = document.getElementById("row-angle-final");
    const rowConeSlip = document.getElementById("row-cone-slip");
    const lblExt1Row = document.getElementById("lbl-ext1-l-row");
    const lblExt2Row = document.getElementById("lbl-ext2-l-row");

    if (isSlopedRoof) {
        if (state.nbUsers > 1) {
            state.nbUsers = 1;
            const uInput = document.getElementById("input-users");
            if (uInput) uInput.value = 1;
        }
        const slopedReport = SlopedSystemConesModule.getFullScenarioReport(state.roofSlope || 15, realSpanMax, state.lineLength);
        const retained = slopedReport.retainedMax;

        ext1L = retained.loadCellTopKn;
        ext2L = retained.loadCellBottomKn;

        if (lblExt1Row) lblExt1Row.textContent = ["Force Extrémité Haut :", "Top End Force:", "Fuerza Extremo Superior:"][l];
        if (lblExt2Row) lblExt2Row.textContent = ["Force Extrémité Bas :", "Bottom End Force:", "Fuerza Extremo Inferior:"][l];

        if (rowAngleFinal) {
            rowAngleFinal.style.display = "flex";
            document.getElementById("val-angle-final").textContent = `${retained.finalAngleDeg.toFixed(2)}°`;
        }
        if (rowConeSlip) {
            rowConeSlip.style.display = "flex";
            const coneSlipsStr = retained.cones.map(c => `C${c.index}: ${c.slipMm}mm`).join(" | ");
            document.getElementById("val-cone-slip").textContent = coneSlipsStr;
        }
    } else {
        if (lblExt1Row) lblExt1Row.textContent = TRANSLATIONS.lblExt1LRow[l];
        if (lblExt2Row) lblExt2Row.textContent = TRANSLATIONS.lblExt2LRow[l];
        if (rowAngleFinal) rowAngleFinal.style.display = "none";
        if (rowConeSlip) rowConeSlip.style.display = "none";
    }

    const postName = getActivePostName();
    const lblAnchor = document.getElementById("lbl-anchor-count");
    if (lblAnchor) lblAnchor.textContent = `${TRANSLATIONS.lblAnchorCount[l]} (${postName})`;
    const displayedAnchorCount = (isOSHA && !isMultiSpan) ? 2 : totalAnchors;
    const valAnchor = document.getElementById("val-anchor-count");
    if (valAnchor) valAnchor.textContent = displayedAnchorCount;

    const activeSubRange = (state.product === "LONG RANGE") ? getLongRangeSubRange(state.lineLength) : state.product;
    const lblAbsorber = document.getElementById("lbl-absorber-count");
    if (lblAbsorber) lblAbsorber.textContent = `${TRANSLATIONS.lblAbsorberCount[l]} (${activeSubRange})`;
    const valAbsorber = document.getElementById("val-absorber-count");
    if (valAbsorber) valAbsorber.textContent = displayedAnchorCount;

    const valOshaMass = document.getElementById("val-osha-mass");
    if (valOshaMass) {
        const forceLbf = state.arrestForceLbf || 1350.0;
        const knVal = (forceLbf * 0.00444822).toFixed(1);
        valOshaMass.textContent = `${state.nbUsers} pers. (${Math.round(forceLbf)} lbf / ${knVal} kN)`;
    }

    const valFallFactor = document.getElementById("val-fall-factor");
    if (valFallFactor) valFallFactor.textContent = state.fallFactor;

    const valMaxAllowedSpan = document.getElementById("val-max-allowed-span");
    if (valMaxAllowedSpan) valMaxAllowedSpan.textContent = formatDistance(maxSpan, 1, l);

    const lenElem = document.getElementById("val-total-line-len");
    const marginCm = (state.product === "LONG RANGE") ? 30 : 20;
    if (lenElem) lenElem.textContent = `${formatDistance(totalLineLen, 2, l)} ${formatLineMargin(marginCm)}`;

    const valSpanL = document.getElementById("val-span-l");
    if (valSpanL) valSpanL.textContent = formatDistance(realSpanMax, 2, l);

    const valForceL = document.getElementById("val-force-l");
    if (valForceL) valForceL.textContent = formatForce(effortL, l);

    // Flèche : 2 chiffres après la virgule pour OSHA, entier arrondi pour EN 795 (ou inches si EN)
    const deflElem = document.getElementById("val-defl-l");
    if (deflElem) {
        deflElem.textContent = formatDeflection(deflL, l);
    }

    const valExt1L = document.getElementById("val-ext1-l");
    if (valExt1L) valExt1L.textContent = formatForce(ext1L, l);

    const valExt2L = document.getElementById("val-ext2-l");
    if (valExt2L) valExt2L.textContent = formatForce(ext2L, l);

    const rowExt3 = document.getElementById("row-ext3");
    const rowExt4 = document.getElementById("row-ext4");

    if (isOSHA && isMultiSpan) {
        const ext3L = Calculator.extremiteForce3(state.product, realSpanMax, state.nbUsers, state.norm, effortL, deflL, state.fallFactor, support, isMultiSpan);
        const ext4L = Calculator.extremiteForce4(state.product, realSpanMax, state.nbUsers, state.norm, effortL, deflL, state.fallFactor, support, isMultiSpan);
        if (rowExt3) {
            rowExt3.style.display = "flex";
            const valExt3L = document.getElementById("val-ext3-l");
            if (valExt3L) valExt3L.textContent = formatForce(ext3L, l);
        }
        if (rowExt4) {
            rowExt4.style.display = "flex";
            const valExt4L = document.getElementById("val-ext4-l");
            if (valExt4L) valExt4L.textContent = formatForce(ext4L, l);
        }
    } else {
        if (rowExt3) rowExt3.style.display = "none";
        if (rowExt4) rowExt4.style.display = "none";
    }

    // ==========================================
    // ODIN-STYLE VERIFICATION OVERVIEW TABLE & CALLOUT BADGES
    // ==========================================
    const valMafLbf = Math.round(effortL * 224.809);
    const valMilLbf = Math.round(ext1L * 224.809);
    const valMalLbf = Math.round(ext1L * 224.809);
    const valCableLbf = Math.round(ext1L * 1.15 * 224.809);

    const isEn = parseInt(state.lang) === 1;
    const smaxDisp = formatDeflection(deflL, state.lang);

    const cpInches = Math.round(64.8 + (deflL / 25.4) + 24.0); // 5.4' FF + Smax + 2' margin
    const cpFeet = Math.floor(cpInches / 12);
    const cpRemInches = Math.round(cpInches % 12);
    const cpDisp = isEn ? `${cpFeet}' ${cpRemInches}"` : formatDistance((cpInches / 39.37007874), 2, state.lang);

    // Update 3D Overlay Callout Badges
    const bMaf = document.getElementById("callout-badge-maf");
    if (bMaf) bMaf.textContent = `MAF = ${valMafLbf} lbf`;

    const bMil = document.getElementById("callout-badge-mil");
    if (bMil) bMil.textContent = `MIL = ${valMilLbf} lbf`;

    const bMal = document.getElementById("callout-badge-mal");
    if (bMal) bMal.textContent = `MAL = ${valMalLbf} lbf`;

    const bSmax = document.getElementById("callout-badge-smax");
    if (bSmax) bSmax.textContent = `Smax (V) = ${smaxDisp}`;

    const bCp = document.getElementById("callout-badge-cp");
    if (bCp) bCp.textContent = `TFD (Cp) = ${cpDisp}`;

    const bTfd = document.getElementById("callout-badge-tfd");
    if (bTfd) bTfd.textContent = `TFD = ${cpDisp}`;

    // Verification Table Updates
    const tierInfo = getOshaMassTierInfo(state.nbUsers);
    const mafLimitLbf = tierInfo.lbs;

    const elMafVal = document.getElementById("verif-val-maf");
    const elMafLim = document.getElementById("verif-lim-maf");
    const elMafPass = document.getElementById("verif-pass-maf");
    if (elMafVal) elMafVal.textContent = isEn ? `${valMafLbf} lbf` : `${valMafLbf} lbf (${effortL.toFixed(1)} kN)`;
    if (elMafLim) elMafLim.textContent = `≤ ${mafLimitLbf} lbf`;
    if (elMafPass) {
        const passMaf = valMafLbf <= mafLimitLbf;
        elMafPass.innerHTML = passMaf
            ? `<span class="badge-pass"><i class="fa-solid fa-check"></i> OK</span>`
            : `<span class="badge-fail"><i class="fa-solid fa-xmark"></i> FAIL</span>`;
    }

    const elMilVal = document.getElementById("verif-val-mil");
    const elMilLim = document.getElementById("verif-lim-mil");
    const elMilPass = document.getElementById("verif-pass-mil");
    if (elMilVal) elMilVal.textContent = isEn ? `${valMilLbf} lbf` : `${valMilLbf} lbf (${ext1L.toFixed(1)} kN)`;
    if (elMilLim) elMilLim.textContent = `≤ 1922 lbf`;
    if (elMilPass) {
        const passMil = valMilLbf <= 1922;
        elMilPass.innerHTML = passMil
            ? `<span class="badge-pass"><i class="fa-solid fa-check"></i> OK</span>`
            : `<span class="badge-fail"><i class="fa-solid fa-xmark"></i> FAIL</span>`;
    }

    const elMalVal = document.getElementById("verif-val-mal");
    const elMalLim = document.getElementById("verif-lim-mal");
    const elMalPass = document.getElementById("verif-pass-mal");
    if (elMalVal) elMalVal.textContent = isEn ? `${valMalLbf} lbf` : `${valMalLbf} lbf (${ext1L.toFixed(1)} kN)`;
    if (elMalLim) elMalLim.textContent = `≤ 1922 lbf`;
    if (elMalPass) {
        const passMal = valMalLbf <= 1922;
        elMalPass.innerHTML = passMal
            ? `<span class="badge-pass"><i class="fa-solid fa-check"></i> OK</span>`
            : `<span class="badge-fail"><i class="fa-solid fa-xmark"></i> FAIL</span>`;
    }

    const elCabVal = document.getElementById("verif-val-cable");
    const elCabLim = document.getElementById("verif-lim-cable");
    const elCabPass = document.getElementById("verif-pass-cable");
    if (elCabVal) elCabVal.textContent = isEn ? `${valCableLbf} lbf` : `${valCableLbf} lbf (${(ext1L * 1.15).toFixed(1)} kN)`;
    if (elCabLim) elCabLim.textContent = `≤ 4406 lbf`;
    if (elCabPass) {
        const passCab = valCableLbf <= 4406;
        elCabPass.innerHTML = passCab
            ? `<span class="badge-pass"><i class="fa-solid fa-check"></i> OK</span>`
            : `<span class="badge-fail"><i class="fa-solid fa-xmark"></i> FAIL</span>`;
    }

    const elCpVal = document.getElementById("verif-val-cp");
    const elCpLim = document.getElementById("verif-lim-cp");
    const elCpPass = document.getElementById("verif-pass-cp");
    if (elCpVal) elCpVal.textContent = cpDisp;
    if (elCpLim) elCpLim.textContent = isEn ? `≤ 14' 9"` : `≤ 4,50 m`;
    if (elCpPass) {
        const passCp = cpInches <= 177;
        elCpPass.innerHTML = passCp
            ? `<span class="badge-pass"><i class="fa-solid fa-check"></i> OK</span>`
            : `<span class="badge-fail"><i class="fa-solid fa-xmark"></i> FAIL</span>`;
    }

    if (realSpanMax > maxSpan + 0.05) {
        if (warningElem) warningElem.classList.remove("hidden");
    } else {
        if (warningElem) warningElem.classList.add("hidden");
    }
}

// ==========================================
// EXPLODED VIEW CAROUSEL MODAL LOGIC
// ==========================================
let currentCarouselImages = [];
let currentCarouselIndex = 0;

function openExplodedCarousel(component) {
    const modal = document.getElementById("carousel-modal");
    const titleElem = document.getElementById("carousel-title");

    if (!modal || !component.exploded || component.exploded.length === 0) return;

    currentCarouselImages = component.exploded;
    currentCarouselIndex = 0;
    titleElem.textContent = `${TRANSLATIONS.carouselTitle[state.lang || 0]} : ${getComponentName(component)}`;

    renderCarouselSlide();
    modal.classList.add("active");
}

function renderCarouselSlide() {
    const slidesElem = document.getElementById("carousel-slides");
    const dotsElem = document.getElementById("carousel-dots");

    slidesElem.innerHTML = `<img src="${currentCarouselImages[currentCarouselIndex]}" alt="Vue éclatée ${currentCarouselIndex + 1}">`;

    dotsElem.innerHTML = "";
    currentCarouselImages.forEach((_, idx) => {
        const dot = document.createElement("span");
        dot.className = `carousel-dot ${idx === currentCarouselIndex ? "active" : ""}`;
        dot.addEventListener("click", () => {
            currentCarouselIndex = idx;
            renderCarouselSlide();
        });
        dotsElem.appendChild(dot);
    });
}

function setupCarouselEventListeners() {
    const modal = document.getElementById("carousel-modal");
    const closeBtn = document.getElementById("carousel-close-btn");
    const prevBtn = document.getElementById("carousel-prev-btn");
    const nextBtn = document.getElementById("carousel-next-btn");

    if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.remove("active"));

    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            currentCarouselIndex = (currentCarouselIndex - 1 + currentCarouselImages.length) % currentCarouselImages.length;
            renderCarouselSlide();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            currentCarouselIndex = (currentCarouselIndex + 1) % currentCarouselImages.length;
            renderCarouselSlide();
        });
    }
}

function populateConfigModalInputs() {
    const isEn = parseInt(state.lang) === 1;

    const shapeSelect = document.getElementById("input-roof-shape");
    if (shapeSelect) shapeSelect.value = state.roofShape || "flat";

    const slopeInput = document.getElementById("input-roof-slope");
    if (slopeInput) slopeInput.value = state.roofSlope !== undefined ? state.roofSlope : 0;

    const slopeGroup = document.getElementById("group-roof-slope");
    if (slopeGroup) slopeGroup.style.display = (state.roofShape === "sloped" || state.roofShape === "triangle") ? "block" : "none";

    const lineLenInput = document.getElementById("input-line-length");
    if (lineLenInput) {
        const valL1 = isEn ? (state.lineLength * METERS_TO_INCHES) : state.lineLength;
        lineLenInput.value = valL1 !== undefined ? (isEn ? valL1.toFixed(1) : valL1) : 15.0;
    }



    const line2LenInput = document.getElementById("input-line2-length");
    if (line2LenInput) {
        const valL2 = isEn ? (state.line2Length * METERS_TO_INCHES) : state.line2Length;
        line2LenInput.value = valL2 !== undefined ? (isEn ? valL2.toFixed(1) : valL2) : 10.0;
    }

    const spanModeSelect = document.getElementById("input-span-mode");
    if (spanModeSelect) spanModeSelect.value = state.spanMode || "standard";

    const customSpanInput = document.getElementById("input-custom-span");
    if (customSpanInput) {
        const valSpan = isEn ? ((state.customSpan || 5.0) * METERS_TO_INCHES) : (state.customSpan || 5.0);
        customSpanInput.value = isEn ? valSpan.toFixed(1) : valSpan;
    }

    const groupCustomSpan = document.getElementById("group-custom-span");
    if (groupCustomSpan) {
        groupCustomSpan.style.display = (state.spanMode === "custom") ? "block" : "none";
    }

    const usersSelect = document.getElementById("input-users");
    if (usersSelect) usersSelect.value = state.nbUsers || 1;

    const forceInput = document.getElementById("input-worker-force") || document.getElementById("input-worker-mass");
    if (forceInput) {
        forceInput.min = isEn ? "500" : "2.0";
        forceInput.max = isEn ? "5000" : "25.0";
        forceInput.step = isEn ? "1" : "0.1";
        forceInput.value = isEn ? Math.round(state.arrestForceLbf || 1350) : parseFloat(((state.arrestForceLbf || 1350) / 224.809).toFixed(1));
    }



    updateMassOptions();
}

// ==========================================
// UI INTERACTIVITY & EVENT BINDINGS
// ==========================================
function setupUIEventListeners() {
    const homeScreen = document.getElementById("home-screen");
    const dashboardScreen = document.getElementById("dashboard-screen");
    const configModal = document.getElementById("config-modal");

    // Language Select Handlers
    const langSelectHome = document.getElementById("lang-select-home");
    const langSelectDb = document.getElementById("lang-select-db");
    if (langSelectHome) {
        langSelectHome.addEventListener("change", (e) => {
            applyLanguage(parseInt(e.target.value));
        });
    }
    if (langSelectDb) {
        langSelectDb.addEventListener("change", (e) => {
            applyLanguage(parseInt(e.target.value));
        });
    }

    const startBtn = document.getElementById("start-config-btn");
    if (startBtn) {
        startBtn.addEventListener("click", () => {
            if (homeScreen) homeScreen.classList.remove("active");
            if (dashboardScreen) dashboardScreen.classList.add("active");
            populateConfigModalInputs();
            if (configModal) configModal.classList.add("active");
            if (!renderer) {
                initThreeEngine();
            } else {
                renderComponentsChecklist();
                preloadActiveModels();
                update3DScene();
                onWindowResize();
            }
        });
    }

    const reconfigBtn = document.getElementById("reconfig-btn");
    if (reconfigBtn) {
        reconfigBtn.addEventListener("click", () => {
            populateConfigModalInputs();
            if (configModal) configModal.classList.add("active");
        });
    }

    const closeBtn = document.getElementById("modal-close-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            if (configModal) configModal.classList.remove("active");
        });
    }

    const cancelBtn = document.getElementById("config-cancel-btn");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            if (configModal) configModal.classList.remove("active");
        });
    }

    const roofShapeSelect = document.getElementById("input-roof-shape");
    const roofSlopeGroup = document.getElementById("group-roof-slope");

    if (roofShapeSelect && roofSlopeGroup) {
        roofShapeSelect.addEventListener("change", (e) => {
            const val = e.target.value;
            roofSlopeGroup.style.display = (val === "sloped" || val === "triangle") ? "block" : "none";
            const uInput = document.getElementById("input-users");
            if (val === "sloped") {
                if (uInput) {
                    uInput.value = 1;
                    uInput.max = 1;
                }
                state.nbUsers = 1;
            } else {
                if (uInput) {
                    const maxU = (state.product === "LIGHT PRO" || state.product === "LONG RANGE") ? 3 : 5;
                    uInput.max = maxU;
                }
            }
            if (val === "flat_overhead") {
                const modalMounting = document.getElementById("input-mounting-type");
                if (modalMounting) modalMounting.value = "overhead";
            }
            if (val !== "flat" && chkLine2 && chkLine2.checked) {
                alert(TRANSLATIONS.alerts.line2FlatOnly[state.lang || 0]);
                chkLine2.checked = false;
                if (groupLine2) groupLine2.style.display = "none";
                state.hasLine2 = false;
            }
            if (val !== "sloped") {
                const newProComps = COMPONENTS_DB["NEW PRO"] || [];
                const xcone = newProComps.find(c => c.id === "X-Cone");
                if (xcone) xcone.checked = false;
            }
        });
    }

    const spanModeSelectElem = document.getElementById("input-span-mode");
    const groupCustomSpanElem = document.getElementById("group-custom-span");
    if (spanModeSelectElem && groupCustomSpanElem) {
        spanModeSelectElem.addEventListener("change", (e) => {
            groupCustomSpanElem.style.display = (e.target.value === "custom") ? "block" : "none";
        });
    }

    const chkLine2 = document.getElementById("input-has-line2");
    const groupLine2 = document.getElementById("group-line2-options");

    if (chkLine2 && groupLine2) {
        chkLine2.addEventListener("change", (e) => {
            const shapeVal = roofShapeSelect ? roofShapeSelect.value : state.roofShape;
            if (e.target.checked && shapeVal !== "flat") {
                alert(TRANSLATIONS.alerts.line2FlatOnly[state.lang || 0]);
                e.target.checked = false;
                groupLine2.style.display = "none";
                state.hasLine2 = false;
                return;
            }
            groupLine2.style.display = e.target.checked ? "grid" : "none";
        });
    }

    document.getElementById("config-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const selectedShape = document.getElementById("input-roof-shape").value || "flat";
        state.roofShape = selectedShape;
        if (selectedShape === "flat_overhead" || selectedShape === "flat" || state.product === "LONG RANGE") {
            state.roofSlope = 0;
        } else {
            const rawSlopeStr = (document.getElementById("input-roof-slope").value || "").toString().replace(',', '.');
            const rawSlope = parseFloat(rawSlopeStr);
            state.roofSlope = isNaN(rawSlope) ? 0 : rawSlope;
        }

        const rawL1Str = (document.getElementById("input-line-length").value || "").toString().replace(',', '.');
        const rawL1 = parseFloat(rawL1Str);
        if (!isNaN(rawL1)) {
            state.lineLength = (parseInt(state.lang) === 1) ? (rawL1 / METERS_TO_INCHES) : rawL1;
        } else {
            state.lineLength = 15.0;
        }

        state.edgeDistance = 3.0;

        const spanModeSelect = document.getElementById("input-span-mode");
        state.spanMode = spanModeSelect ? spanModeSelect.value : "standard";

        if (state.spanMode === "custom") {
            const rawCustomSpanStr = (document.getElementById("input-custom-span").value || "").toString().replace(',', '.');
            const rawCustomSpan = parseFloat(rawCustomSpanStr);
            if (!isNaN(rawCustomSpan) && rawCustomSpan > 0) {
                state.customSpan = (parseInt(state.lang) === 1) ? (rawCustomSpan / METERS_TO_INCHES) : rawCustomSpan;
            } else {
                state.customSpan = 5.0;
            }
        }

        let requestedUsers = parseInt(document.getElementById("input-users").value) || 1;
        if (selectedShape === "sloped") {
            requestedUsers = 1;
            document.getElementById("input-users").value = 1;
        } else if ((state.product === "LIGHT PRO" || state.product === "LONG RANGE") && requestedUsers > 3) {
            alert(TRANSLATIONS.alerts.usersLimit[state.lang || 0]);
            requestedUsers = 3;
            document.getElementById("input-users").value = 3;
        } else if (requestedUsers > 5) {
            requestedUsers = 5;
            document.getElementById("input-users").value = 5;
        }
        state.nbUsers = requestedUsers;

        const rawForceElem = document.getElementById("input-worker-force") || document.getElementById("input-worker-mass");
        if (rawForceElem) {
            const rawForceVal = parseFloat((rawForceElem.value || "").toString().replace(',', '.'));
            if (!isNaN(rawForceVal) && rawForceVal > 0) {
                state.arrestForceLbf = (parseInt(state.lang) === 1) ? rawForceVal : (rawForceVal * 224.809);
            } else {
                state.arrestForceLbf = 1350.0;
            }
        }

        state.fallFactor = 2;
        state.edgeDistance = 3.0;

        if (chkLine2) {
            state.hasLine2 = chkLine2.checked;
            const rawL2Str = (document.getElementById("input-line2-length").value || "").toString().replace(',', '.');
            const rawL2 = parseFloat(rawL2Str);
            if (!isNaN(rawL2)) {
                state.line2Length = (parseInt(state.lang) === 1) ? (rawL2 / METERS_TO_INCHES) : rawL2;
            } else {
                state.line2Length = 10.0;
            }
        }

        // Reset all components to unchecked initially upon validating configuration
        Object.keys(COMPONENTS_DB).forEach(prod => {
            COMPONENTS_DB[prod].forEach(c => {
                c.checked = false;
            });
        });
        Object.keys(state.checkedComponents).forEach(k => {
            state.checkedComponents[k] = false;
        });

        configModal.classList.remove("active");
        homeScreen.classList.remove("active");
        dashboardScreen.classList.add("active");

        if (!renderer) {
            initThreeEngine();
        } else {
            renderComponentsChecklist();
            preloadActiveModels();
            update3DScene();
            onWindowResize();
        }
    });

    // System Cards Selection
    const sysCards = document.querySelectorAll(".system-card");
    sysCards.forEach(card => {
        card.addEventListener("click", () => {
            const chosenSystem = card.dataset.system;

            // Compatibility Check 1: LONG RANGE requires flat_overhead
            if (chosenSystem === "LONG RANGE" && state.roofShape !== "flat_overhead") {
                alert(TRANSLATIONS.alerts.longRangeFlatOverhead[state.lang || 0]);
                return;
            }

            // Compatibility Check 2: flat_overhead is reserved strictly for LONG RANGE
            if (chosenSystem !== "LONG RANGE" && state.roofShape === "flat_overhead") {
                alert(TRANSLATIONS.alerts.overheadLongRangeOnly[state.lang || 0]);
                return;
            }

            // Compatibility Check 3: Mono-slope (sloped) is reserved strictly for NEW PRO
            if (chosenSystem !== "NEW PRO" && state.roofShape === "sloped") {
                alert(TRANSLATIONS.alerts.slopedNewProOnly[state.lang || 0]);
                return;
            }



            // User capacity limit check (3 users max for LIGHT PRO and LONG RANGE)
            const uInput = document.getElementById("input-users");
            if (chosenSystem === "LIGHT PRO" || chosenSystem === "LONG RANGE") {
                if (uInput) uInput.max = 3;
                if (state.nbUsers > 3) {
                    alert(TRANSLATIONS.alerts.usersLimit[state.lang || 0]);
                    state.nbUsers = 3;
                    if (uInput) uInput.value = 3;
                }
            } else {
                if (uInput) uInput.max = (state.roofShape === "sloped") ? 1 : 5;
            }

            sysCards.forEach(c => c.classList.remove("active"));
            card.classList.add("active");
            state.product = chosenSystem;

            // Reset multi-span mode if the selected product does not support multi-span (e.g. LONG RANGE)
            const isOSHA = (state.norm === "OSHA");
            const isMultiSpanAllowed = isOSHA && (chosenSystem === "NEW PRO" || chosenSystem === "LIGHT PRO" || chosenSystem === "LightPro");
            if (!isMultiSpanAllowed) {
                state.oshaSpanMode = "unique";
                const subtabUnique = document.getElementById("subtab-span-unique");
                const subtabMulti = document.getElementById("subtab-span-multi");
                if (subtabUnique) subtabUnique.classList.add("active");
                if (subtabMulti) subtabMulti.classList.remove("active");
            }

            // Ensure all checkboxes start UNCHECKED by default when choosing a system
            const sysList = COMPONENTS_DB[chosenSystem] || [];
            sysList.forEach(c => c.checked = false);

            renderComponentsChecklist();
            preloadActiveModels();
            update3DScene();
        });
    });

    // Roof Texture & Color Pickers
    const roofTexSelect = document.getElementById("select-roof-texture");
    if (roofTexSelect) {
        roofTexSelect.addEventListener("change", (e) => {
            state.roofTexture = e.target.value;
            update3DScene();
        });
    }

    const colRoof = document.getElementById("color-roof");
    if (colRoof) {
        colRoof.addEventListener("input", (e) => {
            state.colors.roof = e.target.value;
            update3DScene();
        });
    }

    const colAnchors = document.getElementById("color-anchors");
    if (colAnchors) {
        colAnchors.addEventListener("input", (e) => {
            state.colors.anchors = e.target.value;
            update3DScene();
        });
    }

    const colCable = document.getElementById("color-cable");
    if (colCable) {
        colCable.addEventListener("input", (e) => {
            state.colors.cable = e.target.value;
            update3DScene();
        });
    }

    const checkObs = document.getElementById("check-obstacles");
    if (checkObs) {
        checkObs.addEventListener("change", (e) => {
            state.showObstacles = e.target.checked;
            update3DScene();
        });
    }

    // View Mode Switches
    const btn3D = document.getElementById("btn-view-3d");
    const btn2D = document.getElementById("btn-view-2d");

    btn3D.addEventListener("click", () => {
        btn3D.classList.add("active");
        btn2D.classList.remove("active");
        state.viewMode = "3d";
        activeCam = perspectiveCam;

        if (controls) {
            controls.object = perspectiveCam;
            controls.enabled = true;
            controls.enableRotate = true;
            controls.enableZoom = true;
            controls.enablePan = true;
            const centerX = state.L / 2;
            const centerZ = state.l / 2;
            controls.target.set(centerX, 0.2, centerZ);
            controls.update();
        }

        update3DScene();
    });

    btn2D.addEventListener("click", () => {
        btn2D.classList.add("active");
        btn3D.classList.remove("active");
        state.viewMode = "2d";
        activeCam = orthographicCam;

        const centerX = state.L / 2;
        const centerZ = state.l / 2;
        orthographicCam.position.set(centerX, 40, centerZ);
        orthographicCam.lookAt(centerX, 0, centerZ);

        if (controls) {
            controls.object = orthographicCam;
            controls.enabled = true;
            controls.enableRotate = false; // Lock rotation so camera remains looking straight down
            controls.enableZoom = true;   // Enable mouse wheel / pinch zoom in 2D!
            controls.enablePan = true;    // Enable drag / pan around 2D plan!
            controls.target.set(centerX, 0, centerZ);
            controls.update();
        }

        update3DScene();
    });

    // Toolbar Actions
    const btnFallSim = document.getElementById("btn-toggle-fall-sim");
    if (btnFallSim) {
        btnFallSim.addEventListener("click", (e) => {
            state.showFallSim = !state.showFallSim;
            e.currentTarget.classList.toggle("active", state.showFallSim);
            update3DScene();
        });
    }

    document.getElementById("btn-reset-cam").addEventListener("click", () => {
        const centerX = state.L / 2;
        const centerZ = state.l / 2;
        if (state.viewMode === "3d") {
            const dist = Math.max(state.L, state.l) * 1.4;
            perspectiveCam.position.set(centerX + dist * 0.8, dist * 0.9, centerZ + dist * 0.8);
            controls.target.set(centerX, 0.2, centerZ);
            controls.update();
        } else {
            orthographicCam.zoom = 1.0;
            orthographicCam.position.set(centerX, 40, centerZ);
            orthographicCam.lookAt(centerX, 0, centerZ);
            orthographicCam.updateProjectionMatrix();
            if (controls) {
                controls.target.set(centerX, 0, centerZ);
                controls.update();
            }
        }
    });

    const btnGrid = document.getElementById("btn-toggle-grid");
    if (btnGrid) {
        btnGrid.addEventListener("click", (e) => {
            state.gridVisible = !state.gridVisible;
            e.currentTarget.classList.toggle("active", state.gridVisible);
            update3DScene();
        });
    }

    function handleFullscreenChange() {
        const isFs = !!document.fullscreenElement || !!document.webkitFullscreenElement || !!document.mozFullScreenElement || !!document.msFullscreenElement;
        const btnFs = document.getElementById("btn-fullscreen");
        const viewport = document.querySelector(".canvas-wrapper");

        if (btnFs) {
            btnFs.innerHTML = isFs
                ? '<i class="fa-solid fa-compress"></i>'
                : '<i class="fa-solid fa-expand"></i>';
            btnFs.classList.toggle("active", isFs);
            btnFs.title = isFs ? "Quitter le plein écran" : "Plein écran";
        }

        if (viewport) {
            viewport.classList.toggle("is-fullscreen", isFs);
        }

        // Trigger multiple resize recalculations to capture post-transition DOM layout rect
        onWindowResize();
        requestAnimationFrame(() => onWindowResize());
        setTimeout(() => onWindowResize(), 100);
        setTimeout(() => onWindowResize(), 300);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    const btnFs = document.getElementById("btn-fullscreen");
    if (btnFs) {
        btnFs.addEventListener("click", () => {
            const viewport = document.querySelector(".canvas-wrapper");
            const isFs = !!document.fullscreenElement || !!document.webkitFullscreenElement || !!document.mozFullScreenElement || !!document.msFullscreenElement;
            if (!isFs) {
                if (viewport.requestFullscreen) {
                    viewport.requestFullscreen().catch(err => console.log(err));
                } else if (viewport.webkitRequestFullscreen) {
                    viewport.webkitRequestFullscreen();
                } else if (viewport.msRequestFullscreen) {
                    viewport.msRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(err => console.log(err));
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        });
    }

    // Node Inspector Events
    const nodeTypeSelect = document.getElementById("node-type-select");
    if (nodeTypeSelect) {
        nodeTypeSelect.addEventListener("change", (e) => {
            const activePositions = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
            if (state.selectedNodeIndex >= 0 && state.selectedNodeIndex < activePositions.length) {
                if (state.drawingMode === "auto") {
                    state.customPoints = activePositions.map(p => ({ ...p }));
                    state.drawingMode = "place";
                    setDrawingMode("place");
                }
                state.customPoints[state.selectedNodeIndex].type = e.target.value;
                update3DScene();
            }
        });
    }

    // Node Inspector Component & Rotation Controls
    const compSelect = document.getElementById("node-comp-select");
    if (compSelect) {
        compSelect.addEventListener("change", (e) => {
            const activePositions = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
            if (state.selectedNodeIndex >= 0 && state.selectedNodeIndex < activePositions.length) {
                if (state.drawingMode === "auto") {
                    state.customPoints = activePositions.map(p => ({ ...p }));
                    state.drawingMode = "place";
                    setDrawingMode("place");
                }
                const selectedCompId = e.target.value;
                state.customPoints[state.selectedNodeIndex].compId = selectedCompId;
                if (selectedCompId === "X-Matrix") {
                    state.customPoints[state.selectedNodeIndex].type = "x_matrix";
                    document.getElementById("node-type-select").value = "x_matrix";
                }
                preloadActiveModels();
                update3DScene();
            }
        });
    }

    const rotSlider = document.getElementById("node-rot-slider");
    if (rotSlider) {
        rotSlider.addEventListener("input", (e) => {
            const activePositions = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
            if (state.selectedNodeIndex >= 0 && state.selectedNodeIndex < activePositions.length) {
                if (state.drawingMode === "auto") {
                    state.customPoints = activePositions.map(p => ({ ...p }));
                    state.drawingMode = "place";
                    setDrawingMode("place");
                }
                const deg = parseFloat(e.target.value);
                state.customPoints[state.selectedNodeIndex].rotY = deg * Math.PI / 180;
                document.getElementById("node-rot-val").textContent = `${Math.round(deg)}°`;
                update3DScene();
            }
        });
    }

    const btnAlign = document.getElementById("btn-rot-align-line");
    if (btnAlign) {
        btnAlign.addEventListener("click", () => {
            if (state.selectedNodeIndex >= 0) {
                autoAlignNodeRotation(state.selectedNodeIndex);
                highlightSelectedNode();
                update3DScene();
            }
        });
    }

    const btn90 = document.getElementById("btn-rot-90");
    if (btn90) {
        btn90.addEventListener("click", () => {
            const activePositions = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
            if (state.selectedNodeIndex >= 0 && state.selectedNodeIndex < activePositions.length) {
                if (state.drawingMode === "auto") {
                    state.customPoints = activePositions.map(p => ({ ...p }));
                    state.drawingMode = "place";
                    setDrawingMode("place");
                }
                const node = state.customPoints[state.selectedNodeIndex];
                node.rotY = ((node.rotY || 0) + Math.PI / 2) % (2 * Math.PI);
                highlightSelectedNode();
                update3DScene();
            }
        });
    }

    const btnDeleteNode = document.getElementById("btn-delete-node");
    if (btnDeleteNode) {
        btnDeleteNode.addEventListener("click", () => {
            const activePositions = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
            if (state.selectedNodeIndex >= 0 && state.selectedNodeIndex < activePositions.length) {
                if (state.drawingMode === "auto") {
                    state.customPoints = activePositions.map(p => ({ ...p }));
                    state.drawingMode = "place";
                    setDrawingMode("place");
                }
                state.customPoints.splice(state.selectedNodeIndex, 1);
                state.selectedNodeIndex = -1;
                highlightSelectedNode();
                update3DScene();
            }
        });
    }

    // Regulatory Norm Tabs & OSHA Subtabs
    const tabEN = document.getElementById("tab-en795");
    const tabOSHA = document.getElementById("tab-osha");
    const subtabUnique = document.getElementById("subtab-span-unique");
    const subtabMulti = document.getElementById("subtab-span-multi");

    if (tabEN) {
        tabEN.addEventListener("click", () => {
            tabEN.classList.add("active");
            if (tabOSHA) tabOSHA.classList.remove("active");
            state.norm = "EN 795";
            state.oshaSpanMode = "unique";
            if (subtabUnique) subtabUnique.classList.add("active");
            if (subtabMulti) subtabMulti.classList.remove("active");
            update3DScene();
        });
    }

    if (tabOSHA) {
        tabOSHA.addEventListener("click", () => {
            tabOSHA.classList.add("active");
            if (tabEN) tabEN.classList.remove("active");
            state.norm = "OSHA";
            const isMultiSpanAllowed = (state.product === "NEW PRO" || state.product === "LIGHT PRO" || state.product === "LightPro");
            if (!isMultiSpanAllowed) {
                state.oshaSpanMode = "unique";
                if (subtabUnique) subtabUnique.classList.add("active");
                if (subtabMulti) subtabMulti.classList.remove("active");
            }
            update3DScene();
        });
    }

    if (subtabUnique) {
        subtabUnique.addEventListener("click", () => {
            subtabUnique.classList.add("active");
            if (subtabMulti) subtabMulti.classList.remove("active");
            state.oshaSpanMode = "unique";
            update3DScene();
        });
    }

    if (subtabMulti) {
        subtabMulti.addEventListener("click", () => {
            const isOSHA = (state.norm === "OSHA");
            const isMultiSpanAllowed = isOSHA && (state.product === "NEW PRO" || state.product === "LIGHT PRO" || state.product === "LightPro");
            if (!isMultiSpanAllowed) return;

            subtabMulti.classList.add("active");
            if (subtabUnique) subtabUnique.classList.remove("active");
            state.oshaSpanMode = "multi";
            update3DScene();
        });
    }

    const exportPdfBtn = document.getElementById("export-pdf-btn");
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener("click", () => {
            generatePDFReport();
        });
    }

    setupCarouselEventListeners();
    renderComponentsChecklist();
}

// ==========================================
// FIXATIONS DATABASE & DYNAMIC RULES ENGINE
// ==========================================
const FIXATIONS_DB = {
    ancrages: {
        "NEW PRO": {
            "matrice_platine": { nombre: 6, type_fixation: "Boulons" },
            "platine_support": { nombre: 2, type_fixation: "—" }
        },
        "LIGHT PRO": {
            "matrice_platine": { nombre: 4, type_fixation: "—" },
            "platine_support": { nombre: 1, type_fixation: "—" }
        },
        "LONG RANGE": {
            "matrice_platine": { nombre: 8, type_fixation: "—" },
            "platine_support": { nombre: 1, type_fixation: "—" }
        }
    },
    pieces: {
        "Potelet galva rigide": {
            "default": { nombre: 4, type_fixation: "—" }
        },
        "Potelet inox rigide": {
            "default": { nombre: 4, type_fixation: "—" }
        },
        "MINI OMEGA": {
            "beton": { nombre: 4, type_fixation: "—" },
            "bac_acier": { nombre: 16, type_fixation: "—" },
            "default": { nombre: 4, type_fixation: "—" }
        },
        "Potelet basculant": {
            "bac_acier": { nombre: 16, type_fixation: "—" },
            "default": { nombre: 16, type_fixation: "—" }
        },
        "A.FIX": {
            "default": { nombre: 2, type_fixation: "Spits 12 ou 14 mm" }
        },
        "X-MATRIX": {
            "default": { nombre: 8, type_fixation: "Vis M6" }
        },
        "X-CONE": {
            "default": { nombre: 4, type_fixation: "Vis BTR M5" }
        }
    }
};

function normalizeSupportKey(roofTextureOrSupport) {
    if (!roofTextureOrSupport) return "beton";
    const s = roofTextureOrSupport.toLowerCase();
    if (s.includes("bac") || s.includes("metal") || s.includes("acier")) return "bac_acier";
    if (s.includes("zinc")) return "toiture_zinc";
    if (s.includes("wood") || s.includes("bois") || s.includes("lamelle")) return "poutre_lamelle_colle";
    if (s.includes("mur") || s.includes("sol") || s.includes("wall")) return "mur_sol";
    if (s.includes("plateforme") || s.includes("platform")) return "plateforme";
    return "beton";
}

function getFixationInfo(piece, niveau, support, ligneModel) {
    const model = (ligneModel || state.product || "NEW PRO").toUpperCase().includes("LONG") ? "LONG RANGE" : ((ligneModel || state.product || "NEW PRO").toUpperCase().includes("LIGHT") ? "LIGHT PRO" : "NEW PRO");
    const supportKey = normalizeSupportKey(support || state.roofTexture);

    if (niveau === "matrice_platine" || niveau === "platine_support") {
        const ancrageData = FIXATIONS_DB.ancrages[model];
        if (ancrageData && ancrageData[niveau]) {
            return ancrageData[niveau];
        }
    } else {
        let pKey = Object.keys(FIXATIONS_DB.pieces).find(k => k.toLowerCase() === (piece || "").toLowerCase());
        if (!pKey) {
            const pLower = (piece || "").toLowerCase();
            if (pLower.includes("mini")) pKey = "MINI OMEGA";
            else if (pLower.includes("basculant") || pLower.includes("pb_hookt")) pKey = "Potelet basculant";
            else if (pLower.includes("galva")) pKey = "Potelet galva rigide";
            else if (pLower.includes("inox")) pKey = "Potelet inox rigide";
            else if (pLower.includes("a-fix") || pLower.includes("afix")) pKey = "A.FIX";
            else if (pLower.includes("x-cone") || pLower.includes("xcone")) pKey = "X-CONE";
        }

        if (pKey && FIXATIONS_DB.pieces[pKey]) {
            const pieceData = FIXATIONS_DB.pieces[pKey];
            if (pieceData[supportKey]) return pieceData[supportKey];
            if (pieceData["default"]) return pieceData["default"];
        }
    }

    return {
        nombre: "Non renseigné — se référer à la notice",
        type_fixation: "Non renseigné — se référer à la notice"
    };
}

function validateProductAssociations() {
    const list = COMPONENTS_DB[state.product] || [];
    const hasMiniOmega = list.some(c => c.checked && (c.id === "Mini_Omega" || c.name.toLowerCase().includes("mini omega")));
    const hasBasculant = list.some(c => c.checked && (c.id === "PB_HOOKt" || c.name.toLowerCase().includes("basculant")));
    const hasRigide = list.some(c => c.checked && (c.id === "P_Galva" || c.id === "P_Inox" || c.name.toLowerCase().includes("rigide")));
    const hasAFix = list.some(c => c.checked && (c.id === "A-Fix" || c.name.toLowerCase().includes("a-fix")));
    if (state.roofShape === "sloped" && state.product !== "NEW PRO") {
        alert(TRANSLATIONS.alerts.slopedNewProOnly[state.lang || 0]);
        return false;
    }

    if (hasMiniOmega && state.product !== "NEW PRO") {
        alert(TRANSLATIONS.alerts.miniOmegaNewPro[state.lang || 0]);
        return false;
    }

    if (hasBasculant && state.product !== "LIGHT PRO" && state.product !== "NEW PRO") {
        alert(TRANSLATIONS.alerts.basculantLightPro[state.lang || 0]);
        return false;
    }

    if (hasRigide && state.product === "LONG RANGE") {
        alert(TRANSLATIONS.alerts.rigideNotLongRange[state.lang || 0]);
        return false;
    }

    if (hasAFix && state.product !== "LONG RANGE") {
        alert(TRANSLATIONS.alerts.afixLongRangeOnly[state.lang || 0]);
        return false;
    }

    return true;
}

function formatFixationType(typeFixation) {
    if (!typeFixation || typeFixation === "—" || typeFixation.trim() === "" || typeFixation.includes("Non renseigné")) {
        return TRANSLATIONS.pdf.referToManual[state.lang || 0];
    }
    return typeFixation;
}

function calculateXConeCount(layout) {
    if (!layout) return 0;
    const spacing = Calculator.getXConeSpacing();
    if (spacing <= 0) return 0;
    let totalCones = 0;
    const slopeRad = (state.roofSlope || 0) * (Math.PI / 180);

    const countConesForLine = (lineNodes) => {
        if (!lineNodes || lineNodes.length < 2) return;
        for (let i = 0; i < lineNodes.length - 1; i++) {
            const pA = lineNodes[i];
            const pB = lineNodes[i + 1];

            const xA = pA.x;
            const zA = pA.z;
            const yA = (state.roofShape === "sloped" || state.roofShape === "triangle") ? zA * Math.tan(slopeRad) : (pA.y || 0);

            const xB = pB.x;
            const zB = pB.z;
            const yB = (state.roofShape === "sloped" || state.roofShape === "triangle") ? zB * Math.tan(slopeRad) : (pB.y || 0);

            const dx = xB - xA;
            const dy = yB - yA;
            const dz = zB - zA;
            const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (segLen < spacing) continue;
            const count = Math.floor(segLen / spacing);
            for (let k = 1; k <= count; k++) {
                const dist = k * spacing;
                if (dist > segLen - 0.2) break;
                totalCones++;
            }
        }
    };

    if (layout.line1) countConesForLine(layout.line1);
    if (state.hasLine2 && layout.line2) countConesForLine(layout.line2);

    return totalCones;
}

// ==========================================
// REPORT HTML & PRINT FALLBACK GENERATOR
// ==========================================
function generateHTMLPrintReport() {
    const l = state.lang || 0;
    const pdfTrans = TRANSLATIONS.pdf;
    const activeLayout = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
    const positions = (activeLayout && activeLayout.all) ? activeLayout.all : (Array.isArray(activeLayout) ? activeLayout : []);
    const anchorPosts = positions.filter(p => p.type !== "x_matrix");
    const totalAnchors = anchorPosts.length > 0 ? anchorPosts.length : positions.length;
    const totalLineLen = Calculator.calculateTotalLineLength(activeLayout, state.product);
    const realSpanMax = Calculator.calculateMaxRealSpan(activeLayout);
    const isOSHA = (state.norm === "OSHA");
    const isMultiSpanAllowed = isOSHA && (state.product === "NEW PRO" || state.product === "LIGHT PRO" || state.product === "LightPro");
    const isMultiSpan = isMultiSpanAllowed ? (state.oshaSpanMode === "multi") : false;
    const support = getActiveSupportType();

    const uEffort = Calculator.effortLonge(state.product, realSpanMax, state.nbUsers, state.norm, state.fallFactor, support, isMultiSpan);
    const uDefl = Calculator.deflection(state.product, realSpanMax, state.fallFactor, support, state.nbUsers, state.norm, isMultiSpan);
    const uExt1 = Calculator.extremiteForce1(state.product, realSpanMax, state.nbUsers, state.norm, uEffort, uDefl, state.fallFactor, support, isMultiSpan);
    const uExt2 = Calculator.extremiteForce2(state.product, realSpanMax, state.nbUsers, state.norm, uEffort, uDefl, state.fallFactor, support, isMultiSpan);

    const valMafLbf = Math.round(uEffort * 224.809);
    const valExt1Lbf = Math.round(uExt1 * 224.809);
    const valExt2Lbf = Math.round(uExt2 * 224.809);
    const tierInfo = getOshaMassTierInfo(state.nbUsers);
    const mafLimitLbf = tierInfo.lbs;

    const cpInches = Math.round(64.8 + (uDefl / 25.4) + 24.0);
    const cpFeet = Math.floor(cpInches / 12);
    const cpRemInches = Math.round(cpInches % 12);
    const cpDisp = (l === 1) ? `${cpFeet}' ${cpRemInches}"` : formatDistance((cpInches / 39.37007874), 2, state.lang);

    const reportWin = window.open('', '_blank');
    if (!reportWin) {
        alert("Veuillez autoriser les fenêtres surgissantes (pop-ups) pour afficher le rapport.");
        return;
    }

    const today = new Date().toLocaleDateString(l === 1 ? "en-US" : (l === 2 ? "es-ES" : "fr-FR"));
    const postName = getActivePostName();

    const compsList = COMPONENTS_DB[state.product] || [];
    const checkedComps = compsList.filter(c => c.checked);

    let nomenclatureRowsHTML = "";
    checkedComps.forEach(c => {
        const fixInfo = getFixationInfo(c.name, null, state.roofTexture, state.product);
        nomenclatureRowsHTML += `<tr><td>${getComponentName(c)}</td><td>${fixInfo.nombre}</td><td>${formatFixationType(fixInfo.type_fixation)}</td></tr>`;
    });
    if (!nomenclatureRowsHTML) {
        nomenclatureRowsHTML = `<tr><td colspan="3">${pdfTrans.noCompChecked[l]}</td></tr>`;
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>HOOKT - ${pdfTrans.title[l]}</title>
<style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; line-height: 1.5; }
    .header { background: #0f172a; color: #fff; padding: 20px 24px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 1px; color: #38bdf8; }
    .header p { margin: 4px 0 0 0; font-size: 13px; color: #94a3b8; }
    .btn-print { background: #2563eb; color: #fff; border: none; padding: 10px 20px; font-weight: 600; border-radius: 6px; cursor: pointer; font-size: 14px; margin-bottom: 20px; }
    .btn-print:hover { background: #1d4ed8; }
    .section { margin-top: 24px; }
    .section-title { font-size: 15px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 14px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 13px; }
    .info-item { margin-bottom: 6px; }
    .info-label { font-weight: 600; color: #475569; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
    th { background: #0f172a; color: #fff; font-weight: 600; }
    tr:nth-child(even) { background: #f8fafc; }
    .badge-ok { color: #16a34a; font-weight: 700; }
    .badge-fail { color: #dc2626; font-weight: 700; }
    @media print {
        .btn-print { display: none; }
        body { padding: 0; }
    }
</style>
</head>
<body>
<button class="btn-print" onclick="window.print()"> Imprimer / Enregistrer en PDF</button>

<div class="header">
    <div>
        <h1>HOOKT</h1>
        <p>${pdfTrans.title[l]}</p>
    </div>
    <div style="text-align: right; font-size: 12px; color: #cbd5e1;">
        Date : ${today}<br>Norme : ${state.norm}
    </div>
</div>

<div class="section">
    <div class="section-title">${pdfTrans.sec1Title[l]}</div>
    <div class="grid-2">
        <div>
            <div class="info-item"><span class="info-label">${pdfTrans.productRange[l]}</span> ${state.product}</div>
            <div class="info-item"><span class="info-label">${pdfTrans.calcStandard[l]}</span> ${state.norm}</div>
            <div class="info-item"><span class="info-label">${pdfTrans.anchorCount[l]}${postName}) :</span> ${totalAnchors}</div>
        </div>
        <div>
            <div class="info-item"><span class="info-label">${pdfTrans.lineLengthL1[l]}</span> ${formatDistance(state.lineLength, 2, l)}</div>
            <div class="info-item"><span class="info-label">${pdfTrans.totalDevLength[l]}</span> ${formatDistance(totalLineLen, 2, l)}</div>
            <div class="info-item"><span class="info-label">${pdfTrans.maxUsers[l]}</span> ${state.nbUsers}</div>
        </div>
    </div>
</div>

<div class="section">
    <div class="section-title">${l === 1 ? "2. Lifeline Mechanical Calculation Results" : "2. Résultats des Calculs Mécaniques de la Ligne de Vie"}</div>
    <table>
        <thead>
            <tr><th>${l === 1 ? "Sollicitation / Indicator" : "Sollicitation / Indicateur Mécanique"}</th><th>${l === 1 ? "Calculated Value" : "Valeur Calculée"}</th></tr>
        </thead>
        <tbody>
            <tr><td>${l === 1 ? "Max. Actual Span" : "Portée réelle maximale"}</td><td>${formatDistance(realSpanMax, 2, l)}</td></tr>
            <tr><td>${l === 1 ? "Max. Lanyard Force (Fmax)" : "Effort longe maximal (Fmax)"}</td><td>${formatForce(uEffort, l)}</td></tr>
            <tr><td>${l === 1 ? "Max. Cable Deflection (Smax)" : "Flèche maximale du câble (Smax)"}</td><td>${formatDeflection(uDefl, l)}</td></tr>
            <tr><td>${l === 1 ? "Anchor 1 Force (End 1)" : "Force Ancrage 1 (Extrémité 1)"}</td><td>${formatForce(uExt1, l)}</td></tr>
            <tr><td>${l === 1 ? "Anchor 2 Force (End 2)" : "Force Ancrage 2 (Extrémité 2)"}</td><td>${formatForce(uExt2, l)}</td></tr>
        </tbody>
    </table>
</div>

<div class="section">
    <div class="section-title">${pdfTrans.sec3Title[l]}</div>
    <table>
        <thead>
            <tr><th>Composant</th><th>Quantité / Fixations</th><th>Type de fixation</th></tr>
        </thead>
        <tbody>
            ${nomenclatureRowsHTML}
        </tbody>
    </table>
</div>

</body>
</html>`;

    reportWin.document.write(htmlContent);
    reportWin.document.close();
}

// ==========================================
// REPORT PDF GENERATOR
// ==========================================
function generatePDFReport() {
    if (!validateProductAssociations()) return;

    const l = state.lang || 0;
    const pdfTrans = TRANSLATIONS.pdf;

    if ((state.product === "LONG RANGE" || state.product === "LongRange") && (state.lineLength < 10.0 || state.lineLength > 56.0)) {
        alert(TRANSLATIONS.alerts.longRangeLengthRange[l]);
        return;
    }

    let jsPDFConstructor = null;
    if (window.jspdf && window.jspdf.jsPDF) {
        jsPDFConstructor = window.jspdf.jsPDF;
    } else if (typeof window.jsPDF === "function") {
        jsPDFConstructor = window.jsPDF;
    } else if (typeof jspdf === "function") {
        jsPDFConstructor = jspdf;
    }

    if (!jsPDFConstructor) {
        generateHTMLPrintReport();
        return;
    }

    try {
        const doc = new jsPDFConstructor();
        if (typeof doc.autoTable !== "function") {
            generateHTMLPrintReport();
            return;
        }

    // Brand Header
    doc.setFillColor(15, 23, 42); // Slate dark
    doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("HOOKT", 14, 17);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(pdfTrans.title[l], 50, 16);

    // Section 1: Lifeline Details
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(pdfTrans.sec1Title[l], 14, 35);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const dateLocales = ["fr-FR", "en-US", "es-ES"];
    const today = new Date().toLocaleDateString(dateLocales[l] || "fr-FR");

    const activeLayout = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
    const positions = (activeLayout && activeLayout.all) ? activeLayout.all : (Array.isArray(activeLayout) ? activeLayout : []);
    const anchorPosts = positions.filter(p => p.type !== "x_matrix");
    const totalAnchors = anchorPosts.length > 0 ? anchorPosts.length : positions.length;
    const totalLineLen = Calculator.calculateTotalLineLength(activeLayout, state.product);
    const realSpanMax = Calculator.calculateMaxRealSpan(activeLayout);
    const isOSHA = (state.norm === "OSHA");
    const isMultiSpanAllowed = isOSHA && (state.product === "NEW PRO" || state.product === "LIGHT PRO" || state.product === "LightPro");
    const isMultiSpan = isMultiSpanAllowed ? (state.oshaSpanMode === "multi") : false;
    const support = getActiveSupportType();

    const supportLabel = state.roofTexture === "concrete" ? pdfTrans.concrete[l] : (state.roofTexture === "metal" ? pdfTrans.metal[l] : (state.roofTexture === "bitumen" ? pdfTrans.bitumen[l] : pdfTrans.metalOther[l]));
    const slopeText = (state.roofShape === "flat" || state.roofShape === "flat_overhead" || state.product === "LONG RANGE")
        ? pdfTrans.flatRoofPdf[l]
        : `${state.roofSlope}° (${state.roofShape === "sloped" ? pdfTrans.slopedRoofPdf[l] : pdfTrans.triangleRoofPdf[l]})`;

    const postName = getActivePostName();
    const displayProductPdf = (state.product === "LONG RANGE")
        ? `LONG / SUPER / ULTRA RANGE (${getLongRangeSubRange(state.lineLength)})`
        : state.product;
    const displayAbsorberPdf = (state.product === "LONG RANGE") ? getLongRangeSubRange(state.lineLength) : state.product;

    const colRightX = 115;

    doc.text(`${pdfTrans.genDate[l]}${today}`, 14, 42);
    doc.text(`${pdfTrans.productRange[l]}${displayProductPdf}`, 14, 48);
    doc.text(`${pdfTrans.calcStandard[l]}${state.norm}`, 14, 54);
    const pdfAnchorCount = (isOSHA && !isMultiSpan) ? 2 : totalAnchors;
    doc.text(`${pdfTrans.anchorCount[l]}${postName}) : ${pdfAnchorCount}`, 14, 60);
    doc.text(`${pdfTrans.absorberCount[l]}${displayAbsorberPdf}) : ${pdfAnchorCount}`, 14, 66);

    doc.text(`${pdfTrans.roofSlope[l]}${slopeText}`, colRightX, 42);
    if (state.hasLine2) {
        const juncText = pdfTrans.endJuncPdf[l];
        const strL1 = formatDistance(state.lineLength, 2, l);
        const strL2 = formatDistance(state.line2Length, 2, l);
        doc.text(`${pdfTrans.linesSummary[l]}L1 = ${strL1}  |  L2 = ${strL2} (${juncText})`, colRightX, 48);
    } else {
        const strL1 = formatDistance(state.lineLength, 2, l);
        doc.text(`${pdfTrans.lineLengthL1[l]}${strL1}`, colRightX, 48);
    }
    doc.text(`${pdfTrans.totalDevLength[l]}${formatDistance(totalLineLen, 2, l)}`, colRightX, 54);
    doc.text(`${pdfTrans.maxUsers[l]}${state.nbUsers}`, colRightX, 60);

    // Section 2: Lifeline Mechanical Calculation Results Table
    const sec2TitleText = (l === 1) ? "2. Lifeline Mechanical Calculation Results" : "2. Résultats des Calculs Mécaniques de la Ligne de Vie";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(sec2TitleText, 14, 83);

    const uEffort = Calculator.effortLonge(state.product, realSpanMax, state.nbUsers, state.norm, state.fallFactor, support, isMultiSpan);
    const uDefl = Calculator.deflection(state.product, realSpanMax, state.fallFactor, support, state.nbUsers, state.norm, isMultiSpan);
    const uExt1 = Calculator.extremiteForce1(state.product, realSpanMax, state.nbUsers, state.norm, uEffort, uDefl, state.fallFactor, support, isMultiSpan);
    const uExt2 = Calculator.extremiteForce2(state.product, realSpanMax, state.nbUsers, state.norm, uEffort, uDefl, state.fallFactor, support, isMultiSpan);

    const valMafLbf = Math.round(uEffort * 224.809);
    const valExt1Lbf = Math.round(uExt1 * 224.809);
    const valExt2Lbf = Math.round(uExt2 * 224.809);

    const mechHead = [[(l === 1 ? "Sollicitation / Parameter" : "Indicateur / Sollicitation Mécanique"), (l === 1 ? "Calculated Value" : "Valeur Calculée")]];
    const mechBody = [
        [(l === 1 ? "Max. Actual Span" : "Portée réelle maximale"), formatDistance(realSpanMax, 2, l)],
        [(l === 1 ? "Max. Lanyard Force (Fmax)" : "Effort longe maximal (Fmax)"), formatForce(uEffort, l)],
        [(l === 1 ? "Max. Cable Deflection (Smax)" : "Flèche maximale du câble (Smax)"), formatDeflection(uDefl, l)],
        [(l === 1 ? "Anchor 1 Force (End 1)" : "Force Ancrage 1 (Extrémité 1)"), formatForce(uExt1, l)],
        [(l === 1 ? "Anchor 2 Force (End 2)" : "Force Ancrage 2 (Extrémité 2)"), formatForce(uExt2, l)]
    ];

    if (isOSHA && isMultiSpan) {
        const uExt3 = Calculator.extremiteForce3(state.product, realSpanMax, state.nbUsers, state.norm, state.fallFactor, support, isMultiSpan);
        const uExt4 = Calculator.extremiteForce4(state.product, realSpanMax, state.nbUsers, state.norm, uEffort, uDefl, state.fallFactor, support, isMultiSpan);
        mechBody.push([(l === 1 ? "Anchor 3 Force (Mid 1)" : "Force Ancrage 3 (Milieu 1)"), formatForce(uExt3, l)]);
        mechBody.push([(l === 1 ? "Anchor 4 Force (Mid 2)" : "Force Ancrage 4 (Milieu 2)"), formatForce(uExt4, l)]);
    }

    doc.autoTable({
        startY: 86,
        head: mechHead,
        body: mechBody,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 8.5, cellPadding: 3 }
    });

    // Section 3: Components & Fixations Table with exact 3 columns
    const currentY = doc.lastAutoTable.finalY + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(pdfTrans.sec3Title[l], 14, currentY);

    const compsList = COMPONENTS_DB[state.product] || [];
    const checkedComps = compsList.filter(c => c.checked);

    const hasOmegaOrMini = checkedComps.some(c => {
        const idL = (c.id || "").toLowerCase();
        const nL = (c.name || "").toLowerCase();
        return idL.includes("omega") || idL.includes("mini") || nL.includes("omega") || nL.includes("mini");
    });

    const tableRows = [];

    // 1. Matrice (Absorbeur) selon la gamme / sous-gamme
    const pdfSubRange = getLongRangeSubRange(state.lineLength);
    const matriceLongRangeText = pdfSubRange === "LONG RANGE"
        ? ["Matrice Longue Portée (Long Range)", "Long Range Matrix", "Matriz Larga Distancia (Long Range)"][l]
        : (pdfSubRange === "SUPER RANGE"
            ? ["Matrice Super Portée (Super Range)", "Super Range Matrix", "Matriz Super Distancia (Super Range)"][l]
            : ["Matrice Ultra Portée (Ultra Range)", "Ultra Range Matrix", "Matriz Ultra Distancia (Ultra Range)"][l]);
    const matriceName = state.product === "NEW PRO" ? pdfTrans.matriceNewPro[l] : (state.product === "LIGHT PRO" ? pdfTrans.matriceLightPro[l] : matriceLongRangeText);
    const lvl1 = getFixationInfo(state.product, "matrice_platine", state.roofTexture, state.product);
    const countLvl1 = typeof lvl1.nombre === 'number' ? `${lvl1.nombre * totalAnchors} (${lvl1.nombre}/matrice)` : lvl1.nombre;
    tableRows.push([
        `${matriceName} (x${totalAnchors})`,
        `${countLvl1}`,
        formatFixationType(lvl1.type_fixation)
    ]);

    // 2. Platine de fixation au support / potelet
    const platineName = state.product === "NEW PRO" ? pdfTrans.platineNewPro[l] : (state.product === "LIGHT PRO" ? pdfTrans.platineLightPro[l] : pdfTrans.platineLongRange[l]);
    const lvl2 = getFixationInfo(state.product, "platine_support", state.roofTexture, state.product);
    const countLvl2 = typeof lvl2.nombre === 'number' ? `${lvl2.nombre * totalAnchors} (${lvl2.nombre}/platine)` : lvl2.nombre;
    const typeFixPlatine = hasOmegaOrMini ? pdfTrans.inoxBolts[l] : formatFixationType(lvl2.type_fixation);

    tableRows.push([
        `${platineName} (x${totalAnchors})`,
        `${countLvl2}`,
        typeFixPlatine
    ]);

    // 3. Potelets ou pièces additionnelles présent(e)s dans la configuration
    checkedComps.forEach(c => {
        const cIdLower = (c.id || "").toLowerCase();

        if (cIdLower === "new_pro" || cIdLower === "lightpro" || cIdLower === "longrange") {
            return;
        }

        const fixInfo = getFixationInfo(c.name, null, state.roofTexture, state.product);
        let qtyItem = totalAnchors;
        let countFix = fixInfo.nombre;

        if (cIdLower.includes("x-cone") || cIdLower.includes("xcone")) {
            const xConeCount = calculateXConeCount(activeLayout);
            qtyItem = xConeCount;
            countFix = typeof fixInfo.nombre === 'number' ? `${fixInfo.nombre * xConeCount} (${fixInfo.nombre}/x-cone)` : fixInfo.nombre;
        } else if (typeof fixInfo.nombre === 'number') {
            countFix = `${fixInfo.nombre * totalAnchors} (${fixInfo.nombre}/potelet)`;
        }

        tableRows.push([
            `${getComponentName(c)} (x${qtyItem})`,
            `${countFix}`,
            formatFixationType(fixInfo.type_fixation)
        ]);
    });

    if (tableRows.length === 0) {
        tableRows.push([pdfTrans.noCompChecked[l], "-", "-"]);
    }

    doc.autoTable({
        startY: currentY + 4,
        head: [pdfTrans.table3Headers[l]],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8 }
    });

    // Footer on all PDF pages with Website, Email, and Phone number
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        doc.line(14, 280, 196, 280);

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);

        const currentYear = new Date().getFullYear();
        doc.text(pdfTrans.footerRights[l].replace('{year}', currentYear), 14, 285);
        doc.text(pdfTrans.footerContacts[l], 14, 289);
        doc.text(`${pdfTrans.pageStr[l]} ${i} / ${pageCount}`, 180, 289);
    }

        doc.save(`HOOKT_Rapport_Installation_${state.product.replace(/\s+/g, '_')}_${today.replace(/\//g, '-')}.pdf`);
    } catch (err) {
        console.warn("jsPDF report error, falling back to printable HTML report:", err);
        generateHTMLPrintReport();
    }
}

function renderComponentsChecklist() {
    const listContainer = document.getElementById("components-list");
    if (!listContainer) return;

    const l = state.lang || 0;
    listContainer.innerHTML = "";
    if (!state.product) {
        listContainer.innerHTML = `
            <div class="empty-state-notice" style="padding: 1.25rem; text-align: center; color: #94a3b8; font-size: 0.95rem; background: rgba(255,255,255,0.04); border: 1px dashed #334155; border-radius: 10px; margin-top: 0.5rem; line-height: 1.5;">
                <i class="fa-solid fa-hand-pointer" style="margin-right: 0.5rem; color: #3b82f6; font-size: 1.2rem;"></i><br>
                <strong>${TRANSLATIONS.emptyStateTitle[l]}</strong><br>
                ${TRANSLATIONS.emptyStateSub[l]}
            </div>
        `;
        return;
    }

    const comps = COMPONENTS_DB[state.product] || [];

    comps.forEach(c => {
        const item = document.createElement("div");
        item.className = `component-check-card ${c.checked ? "active" : ""}`;
        item.dataset.compId = c.id;

        let explodedBtnHTML = "";
        if (c.exploded && c.exploded.length > 0) {
            explodedBtnHTML = `<button type="button" class="btn-exploded" title="${TRANSLATIONS.carouselTitle[l]}"><i class="fa-solid fa-eye"></i></button>`;
        }

        item.innerHTML = `
            <div class="comp-chk-wrapper">
                <input type="checkbox" class="comp-chk-input" id="chk-${c.id}" ${c.checked ? "checked" : ""}>
            </div>
            <div class="comp-info">
                <span class="comp-name">${getComponentName(c)}</span>
            </div>
            ${explodedBtnHTML}
        `;

        const chk = item.querySelector(".comp-chk-input");

        item.addEventListener("click", (e) => {
            if (e.target.closest(".btn-exploded")) return;
            if (e.target !== chk) {
                chk.checked = !chk.checked;
            }
            c.checked = chk.checked;

            // Constraint A: X-Cone restriction (allowed ONLY on mono-pitch / sloped roof between 15° and 75°)
            if (c.id === "X-Cone" && c.checked) {
                if (state.roofShape !== "sloped") {
                    alert("⚠️ CONFIGURATION INCOMPATIBLE :\nL'option X-CONE est utilisable uniquement en configuration toit mono-pente (incliné).");
                    c.checked = false;
                    chk.checked = false;
                    item.classList.remove("active");
                    return;
                }
                const slope = state.roofSlope || 0;
                if (slope < 15 || slope > 75) {
                    alert("⚠️ CONFIGURATION INCOMPATIBLE :\nL'option X-CONE est utilisable uniquement pour une pente de toiture comprise entre 15° et 75°.");
                    c.checked = false;
                    chk.checked = false;
                    item.classList.remove("active");
                    return;
                }
            }

            // Constraint C: Mutual Exclusivity for Main System Models (Absorbers & Posts) within NEW PRO and LIGHT PRO (LONG RANGE allows both Absorber & A-Fix checked)
            if (state.product !== "LONG RANGE") {
                const mainModelVariantIds = ["New_Pro", "Mini_Omega", "P_Inox", "LightPro", "PB_HOOKt", "P_Galva"];
                if (c.checked && mainModelVariantIds.includes(c.id)) {
                    const sysList = COMPONENTS_DB[state.product || "NEW PRO"] || [];
                    sysList.forEach(otherComp => {
                        if (otherComp.id !== c.id && mainModelVariantIds.includes(otherComp.id)) {
                            otherComp.checked = false;
                            if (state.checkedComponents) state.checkedComponents[otherComp.id] = false;
                        }
                    });
                }
            }

            if (state.checkedComponents) state.checkedComponents[c.id] = c.checked;
            item.classList.toggle("active", c.checked);

            renderComponentsChecklist();

            preloadActiveModels();
            update3DScene();
        });

        const explodedBtn = item.querySelector(".btn-exploded");
        if (explodedBtn) {
            explodedBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openExplodedCarousel(c);
            });
        }

        listContainer.appendChild(item);
    });
}

// Kickoff
document.addEventListener("DOMContentLoaded", () => {
    state.product = "NEW PRO";
    setupUIEventListeners();
    applyLanguage(state.lang || 0);
    const layout = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
    updateCalculationsUI(layout, Calculator.getMaxSpan(state.product));

    const canvasContainer = document.getElementById("canvas3d");
    if (canvasContainer && !renderer) {
        initThreeEngine();
    }
});
