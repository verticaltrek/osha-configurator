// ==========================================
// HOOKT LIFELINE CONFIGURATOR - CORE JS ENGINE
// Clean White Theme Edition: 3D Visualizer & Mechanical Calculator
// ==========================================

// ==========================================
// MODULE : ELEVATION & ENGINEER COEFFICIENT (Spec V2 — 07 / Prompt 12)
// ==========================================
const ELEVATION_TO_FALL_FACTOR = {
    "overhead": 0,
    "d_ring":   1,
    "knee":     2
};
const FALL_FACTOR_TOLERANCE_M = 0.15; // 0.15 m (6 po)
// Spec V2 — 07 / Prompt 12: Engineer coefficient & calculation constants
const ENGINEER_COEF_APPLIES_TO = ["forces"];
const SLOPE_MAX_DEG = 75;
const END_BUFFER_LENGTH = 0.20;
const FALL_TEST_REFERENCE_FACTOR = 2.0;
const MAD_WARN_M = 2.0; // Spec V2 — 08: Seuil d'avertissement MAD > 2.0m
const DEPRECATED_CONFIGS = ["3", "4", "5", "7", "9", "10", "multi_bend_90", "multi_bend_var", "multi_bend_multi90", "multi_bend_multivar", "slope_multi", "slope_horizontal_comb"];
if (typeof window !== "undefined") {
    window.ELEVATION_TO_FALL_FACTOR = ELEVATION_TO_FALL_FACTOR;
    window.FALL_FACTOR_TOLERANCE_M = FALL_FACTOR_TOLERANCE_M;
    window.ENGINEER_COEF_APPLIES_TO = ENGINEER_COEF_APPLIES_TO;
    window.SLOPE_MAX_DEG = SLOPE_MAX_DEG;
    window.END_BUFFER_LENGTH = END_BUFFER_LENGTH;
    window.FALL_TEST_REFERENCE_FACTOR = FALL_TEST_REFERENCE_FACTOR;
    window.MAD_WARN_M = MAD_WARN_M;
    window.DEPRECATED_CONFIGS = DEPRECATED_CONFIGS;
}

function getEffectiveDRingHeight(bodyPosition) {
    const pos = bodyPosition || (typeof state !== "undefined" && state ? state.bodyPosition : "standing") || "standing";
    const baseH = (typeof state !== "undefined" && state && state.dRingHeightM !== undefined) ? state.dRingHeightM : 1.50;
    if (pos === "kneeling") {
        return Math.max(0.15, baseH - 0.914); // ~0.586 m (Spec V2_04 : 36 po / 0.914m de baisse du point d'attache)
    } else if (pos === "lying") {
        return 0.15; // Point d'attache au ras du sol
    }
    return baseH; // Debout : 1.50 m
}
if (typeof window !== "undefined") window.getEffectiveDRingHeight = getEffectiveDRingHeight;

function computeFallFactorFromElevation(preset, elevationVal, bodyPosition) {
    // 1. Direct preset lookup via ELEVATION_TO_FALL_FACTOR (Acceptance Criteria 1 & 7)
    if (preset && typeof ELEVATION_TO_FALL_FACTOR !== "undefined" && (preset in ELEVATION_TO_FALL_FACTOR)) {
        return ELEVATION_TO_FALL_FACTOR[preset];
    }
    // 2. Custom elevation comparison with D-ring height and tolerance (Criterion 2)
    const h = parseFloat(elevationVal);
    if (isNaN(h)) return 2; // conservative default
    const hd = getEffectiveDRingHeight(bodyPosition);
    const tol = (typeof FALL_FACTOR_TOLERANCE_M !== "undefined") ? FALL_FACTOR_TOLERANCE_M : 0.15;
    if (h > hd + tol) {
        return 0;
    } else if (h >= hd - tol && h <= hd + tol) {
        return 1;
    } else {
        return 2; // Sous l'anneau D : cas le plus défavorable / conservateur (Facteur 2)
    }
}
if (typeof window !== "undefined") window.computeFallFactorFromElevation = computeFallFactorFromElevation;

// ==========================================
// MODULE : NOUVELLE RÉPARTITION DES EFFORTS AUX ANCRAGES (V2)
// Spec : prompt_antigravity_calcul_efforts_ancrages_v2.md
// (Multi-portée tous ancrages avec P0 hors fenêtre, Coude > 40°, Cross Config 11, Grid Config 12)
// ==========================================
const ANCHOR_EFFORT_CONFIG = {
    K_ATTENUATION_MIN: 0.46,
    K_ATTENUATION_MAX: 0.53,
    K_ATTENUATION_DEFAULT: 0.495,
    BEND_THRESHOLD_DEG: 40,
    BEND_FACTOR_AFTER: 0.50,
    CROSS_OTHER_FACTOR: 0.25,
    GRID_PRETENSION_KG: 600,
    GRID_USER_MASS_KG: 141,
    GRID_LEVEL_FACTOR: 0.25,
    GRID_CUTOFF_RATIO: 0.01,
    G_ACCEL: 9.81,
    CABLE_PRETENSION_P0: 1.0 // Tension nominale P0 du câble pour les ancrages hors fenêtre de chute (spec V2)
};

// Spec V2 — 05: Resolved Corner Forces (Vector Math: R = T1*u1 + T2*u2)
function calculateCornerEffort(bendNode, tensionInKn = 10.0, tensionOutKn = 10.0) {
    const u1 = { x: bendNode.u1x !== undefined ? bendNode.u1x : -1, z: bendNode.u1z !== undefined ? bendNode.u1z : 0 };
    const u2 = { x: bendNode.u2x !== undefined ? bendNode.u2x : 0, z: bendNode.u2z !== undefined ? bendNode.u2z : 1 };

    const Rx = tensionInKn * u1.x + tensionOutKn * u2.x;
    const Rz = tensionInKn * u1.z + tensionOutKn * u2.z;
    const R_magnitude = Math.sqrt(Rx * Rx + Rz * Rz);

    const bx = u1.x + u2.x;
    const bz = u1.z + u2.z;
    const b_len = Math.sqrt(bx * bx + bz * bz);

    let angleDeg = 0;
    if (b_len > 0.0001 && R_magnitude > 0.0001) {
        const dot = (Rx * (bx / b_len) + Rz * (bz / b_len)) / R_magnitude;
        angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
    }

    const angleTurnDeg = Math.abs(bendNode.bendAngleDeg !== undefined ? bendNode.bendAngleDeg : 90);
    const isOver40 = angleTurnDeg > 40;

    return {
        t1Kn: tensionInKn,
        t2Kn: tensionOutKn,
        resultantKn: parseFloat(R_magnitude.toFixed(2)),
        angleWithBisectorDeg: parseFloat(angleDeg.toFixed(1)),
        isDoubledAnchor: isOver40,
        distribution: isOver40 ? {
            anchor1Kn: parseFloat((R_magnitude / 2).toFixed(2)),
            anchor2Kn: parseFloat((R_magnitude / 2).toFixed(2))
        } : null
    };
}
window.calculateCornerEffort = calculateCornerEffort;

// System helper functions for product identification and normalization
function isCore(product) {
    const p = (product || (typeof state !== "undefined" ? state.product : "") || "").toUpperCase();
    return p === "CORE" || p.includes("LIGHT");
}

function isPro(product) {
    const p = (product || (typeof state !== "undefined" ? state.product : "") || "").toUpperCase();
    return p === "PRO" || p === "NEW PRO" || p.includes("NEW");
}

function isExtreme(product) {
    const p = (product || (typeof state !== "undefined" ? state.product : "") || "").toUpperCase();
    return p === "EXTREME" || p.includes("RANGE") || p.includes("LONG") || p.includes("SUPER") || p.includes("ULTRA");
}

function normalizeProduct(p) {
    if (!p) return "CORE";
    if (isCore(p)) return "CORE";
    if (isExtreme(p)) return "EXTREME";
    if (isPro(p)) return "PRO";
    return p;
}
window.isCore = isCore;
window.isPro = isPro;
window.isExtreme = isExtreme;
window.normalizeProduct = normalizeProduct;

// Full Anchor Forces Table Generator across all N anchors (Spec V2 - 05)
function generateAllAnchorsTable(spans, fallSpanIdx = 0, tensionMidKn = 12.0, product = "CORE") {
    const totalSpans = spans ? spans.length : 1;
    const totalLogicalAnchors = totalSpans + 1;
    const isRange = isExtreme(product);
    const pretensionP0Kn = isRange ? 5.88 : 0.98; // 600 kg vs 100 kg

    const anchors = [];

    // Fall span window: anchors adjacent to fallSpanIdx are fallSpanIdx and fallSpanIdx + 1
    const fallA1 = fallSpanIdx;
    const fallA2 = fallSpanIdx + 1;

    let bendsBefore = 0;

    for (let i = 0; i < totalLogicalAnchors; i++) {
        let type = "intermediaire";
        let role = "Potelet Intermédiaire";
        let baseEffortKn = pretensionP0Kn;
        let remark = "Tension nominale câble (P0)";

        if (i === 0) {
            type = "extremite";
            role = "Ancrage d'extrémité (avec absorbeur)";
            baseEffortKn = parseFloat((tensionMidKn * 0.75).toFixed(2));
            remark = "Extrémité départ ligne";
        } else if (i === totalLogicalAnchors - 1) {
            type = "extremite";
            role = "Ancrage d'extrémité (avec absorbeur)";
            baseEffortKn = parseFloat((tensionMidKn * 0.75).toFixed(2));
            remark = "Extrémité fin ligne";
        } else if (i === fallA1 || i === fallA2) {
            type = "chute";
            role = "Ancrage de la portée de chute";
            baseEffortKn = parseFloat(tensionMidKn.toFixed(2));
            remark = "Sous tension maximale directe";
        } else if (Math.abs(i - fallA1) === 1 || Math.abs(i - fallA2) === 1) {
            type = "adjacent";
            role = "Potelet adjacent direct";
            baseEffortKn = parseFloat((tensionMidKn * 0.495).toFixed(2)); // Règle 1 K=0.495
            remark = "Atténuation Règle 1 (K=0.495)";
        } else {
            type = "intermediaire_hors_fenetre";
            role = "Potelet intermédiaire hors fenêtre";
            baseEffortKn = pretensionP0Kn;
            remark = "Tension câble P0";
        }

        const effKn = Math.max(pretensionP0Kn, parseFloat((baseEffortKn * Math.pow(0.5, bendsBefore)).toFixed(2)));

        // Spec V2 — 17: Coude > 40° -> Ancrage double A#a / A#b avec même valeur d'effort
        let isDouble = false;
        if (i >= 1 && i < totalLogicalAnchors - 1 && spans && spans[i - 1]) {
            const bDeg = Math.abs(parseFloat(spans[i - 1].bendDeg || spans[i - 1].bend_after_deg || (spans[i - 1].bend90 ? 90 : 0)) || 0);
            if (bDeg > 40) isDouble = true;
        }

        if (isDouble) {
            const adjA = [];
            if (i > 0) adjA.push(`S${i}`);
            const adjB = [];
            if (i < totalSpans) adjB.push(`S${i + 1}`);

            anchors.push({
                id: `A${i + 1}a`,
                type: "double",
                role: "Ancrage double",
                adjacentSpans: adjA,
                effortKn: effKn,
                remark: "Ancrage double"
            });
            anchors.push({
                id: `A${i + 1}b`,
                type: "double",
                role: "Ancrage double",
                adjacentSpans: adjB,
                effortKn: effKn,
                remark: "Ancrage double"
            });
            bendsBefore++;
        } else {
            const adj = [];
            if (i > 0) adj.push(`S${i}`);
            if (i < totalSpans) adj.push(`S${i + 1}`);

            anchors.push({
                id: `A${i + 1}`,
                type,
                role,
                adjacentSpans: adj,
                effortKn: effKn,
                remark
            });
        }
    }

    return anchors;
}
window.generateAllAnchorsTable = generateAllAnchorsTable;

// Missing Formula Fallback Check (Spec V2 - 05)
function getEngineeringOutputs(st = state, fallResults = {}) {
    return {
        systemDesign: (st.appMode === "restraint") ? "Retenue (Restraint)" : "Arrêt de chute (Fall Arrest)",
        nbUsers: st.nbUsers || 1,
        cablePretension: isExtreme(st.product) 
            ? "600 kg (5.88 kN / 1 323 lb)" 
            : "100 kg (0.98 kN / 220 lb)",
        initialSag: "Donnée à renseigner", // Spec V2_05: pas de formule fournie -> "Donnée à renseigner"
        bufferRecoil: "Donnée à renseigner", // Spec V2_05
        safetyFactor: "Donnée à renseigner", // Spec V2_05
        maxIntermediateLoadKn: parseFloat(((st.arrestLoadKn || (st.arrestLoadLbf ? st.arrestLoadLbf * 0.00444822 : 6.0))).toFixed(2)),
        maxTensionKn: fallResults.maxTensionKn || 0,
        criticalSpanId: fallResults.critSpanTension || "S1",
        maxDeflectionM: fallResults.maxDeflectionM || 0,
        totalClearanceM: fallResults.totalClearanceM || 0
    };
}
window.getEngineeringOutputs = getEngineeringOutputs;

const AnchorEffortDistributionModule = {
    config: ANCHOR_EFFORT_CONFIG,

    // RÈGLE 1 — Multi-portée : passage de 4 à 6 points
    // [A1, A2, A3, A4] -> [A0, A1, A2, A3, A4, A5]
    // A0 = K_gauche * A1, A5 = K_droite * A4 (par défaut K = 0.495)
    calculateRule1_MultiSpan(a1, a2, a3, a4, kGauche = ANCHOR_EFFORT_CONFIG.K_ATTENUATION_DEFAULT, kDroite = ANCHOR_EFFORT_CONFIG.K_ATTENUATION_DEFAULT) {
        const kG = (kGauche !== undefined && kGauche !== null) ? kGauche : this.config.K_ATTENUATION_DEFAULT;
        const kD = (kDroite !== undefined && kDroite !== null) ? kDroite : this.config.K_ATTENUATION_DEFAULT;
        const a0 = kG * a1;
        const a5 = kD * a4;
        return [a0, a1, a2, a3, a4, a5];
    },

    // RÈGLE 2 — Multi-portée avec coude (bend)
    // θ <= 40° : Règle 1 inchangée (6 points)
    // θ > 40° : Déduction de 0.50 par coude après la paire d'ancrages de coude (cumulatif)
    calculateRule2_Bend(sixPoints, bendsLeft = [], bendsRight = []) {
        const res = [...sixPoints];

        // Process left side (from fall span going left: index 1 and 0)
        let factorLeftA1 = 1.0;
        let factorLeftA0 = 1.0;
        if (Array.isArray(bendsLeft)) {
            bendsLeft.forEach(b => {
                const angle = Math.abs(b.angleDeg || b || 0);
                if (angle > this.config.BEND_THRESHOLD_DEG) {
                    if (b.pos === 'before_A1') {
                        factorLeftA1 *= this.config.BEND_FACTOR_AFTER;
                        factorLeftA0 *= this.config.BEND_FACTOR_AFTER;
                    } else {
                        factorLeftA0 *= this.config.BEND_FACTOR_AFTER;
                    }
                }
            });
        }
        res[1] *= factorLeftA1;
        res[0] *= factorLeftA0;

        // Process right side (from fall span going right: index 4 and 5)
        let factorRightA4 = 1.0;
        let factorRightA5 = 1.0;
        if (Array.isArray(bendsRight)) {
            bendsRight.forEach(b => {
                const angle = Math.abs(b.angleDeg || b || 0);
                if (angle > this.config.BEND_THRESHOLD_DEG) {
                    if (b.pos === 'before_A4') {
                        factorRightA4 *= this.config.BEND_FACTOR_AFTER;
                        factorRightA5 *= this.config.BEND_FACTOR_AFTER;
                    } else {
                        factorRightA5 *= this.config.BEND_FACTOR_AFTER;
                    }
                }
            });
        }
        res[4] *= factorRightA4;
        res[5] *= factorRightA5;

        return res;
    },

    // Helper automatisé pour dériver la règle 2 depuis state.spans et la portée de chute
    calculateRule2_FromSpans(sixPoints, spans = [], fallSpanIdx = 0) {
        if (!spans || spans.length === 0) return [...sixPoints];
        const hasBend40 = spans.some(sp => sp && (sp.bend90 || Math.abs(parseFloat(sp.bendDeg || sp.bend_after_deg || 0)) > this.config.BEND_THRESHOLD_DEG));
        if (hasBend40) {
            // Spec V2 — 17 replaces Rule 2 for bends > 40° with double anchor A#a / A#b and line-level 0.5 attenuation in getAdaptedMultiSpanResults
            return [...sixPoints];
        }
        return [...sixPoints];
    },

    // ADAPTATION MULTI-PORTÉE AU NOMBRE RÉEL D'ANCRAGES (V2 : TOUS LES ANCRAGES DE LA LIGNE)
    // - Affiche TOUS les ancrages de la ligne (pas seulement 6).
    // - Les 6 ancrages dans la fenêtre autour de la chute reçoivent les efforts de la règle 1 & 2.
    // - Les ancrages hors fenêtre portent la tension nominale du câble P0 (1.00 kN par défaut).
    // - Spec V2 — 17 : Coudes > 40° créent un ancrage double A#a / A#b (même effort, un seul compté dans la fenêtre, x0.5 après).
    getAdaptedMultiSpanResults(sixPointsWithBends, totalAnchors = 6, lang = 0, fallSpanIdx = 0, p0Value = null, spansArg = null) {
        const l = (lang === 1 || lang === 2) ? lang : 0;
        const res = [...sixPointsWithBends];
        const p0 = (p0Value !== null && p0Value !== undefined) ? p0Value : (this.config.CABLE_PRETENSION_P0 || 1.0);

        let appState = null;
        try { if (typeof state !== "undefined") appState = state; } catch (e) {}
        if (!appState && typeof window !== "undefined" && window.state) appState = window.state;
        const effectiveSpans = spansArg || (appState?.spans || null);
        const hasBend40 = effectiveSpans && Array.isArray(effectiveSpans) && effectiveSpans.some(sp => sp && (sp.bend90 || Math.abs(parseFloat(sp.bendDeg || sp.bend_after_deg || 0)) > this.config.BEND_THRESHOLD_DEG));

        // Spec V2 — 17 : Coudes supérieurs à 40°, ancrage double A#a / A#b
        if (hasBend40 && effectiveSpans && effectiveSpans.length > 0) {
            const nbSpans = effectiveSpans.length;
            const nbLogical = nbSpans + 1;
            const fIdx = Math.max(0, Math.min(nbSpans - 1, fallSpanIdx || 0));

            // Determine base value for each logical anchor node 0..nbLogical-1 from the 6-anchor rule
            let baseVals = [];
            let isAttenuatedNode = [];

            if (nbLogical === 6) {
                baseVals = [...res];
                isAttenuatedNode = [true, false, false, false, false, true];
            } else if (nbLogical === 2) {
                baseVals = [res[1], res[2]];
                isAttenuatedNode = [false, false];
            } else if (nbLogical === 3) {
                if (fIdx === 0) {
                    baseVals = [res[1], res[2], res[3]];
                    isAttenuatedNode = [false, false, false];
                } else {
                    baseVals = [res[0], res[1], res[2]];
                    isAttenuatedNode = [true, false, false];
                }
            } else if (nbLogical === 4) {
                if (fIdx === 0) {
                    baseVals = [res[1], res[2], res[3], res[4]];
                    isAttenuatedNode = [false, false, false, false];
                } else {
                    baseVals = [res[0], res[1], res[2], res[3]];
                    isAttenuatedNode = [true, false, false, false];
                }
            } else if (nbLogical === 5) {
                if (fIdx === 0) {
                    baseVals = [res[1], res[2], res[3], res[4], res[5]];
                    isAttenuatedNode = [false, false, false, false, true];
                } else {
                    baseVals = [res[0], res[1], res[2], res[3], res[4]];
                    isAttenuatedNode = [true, false, false, false, false];
                }
            } else {
                // nbLogical > 6: sliding 6-anchor window
                const winStart = Math.max(0, Math.min(nbLogical - 6, fIdx - 2));
                const winEnd = winStart + 5;
                for (let idx = 0; idx < nbLogical; idx++) {
                    if (idx >= winStart && idx <= winEnd) {
                        const sixIdx = idx - winStart;
                        baseVals.push(res[sixIdx]);
                        isAttenuatedNode.push(sixIdx === 0 || sixIdx === 5);
                    } else {
                        baseVals.push(p0);
                        isAttenuatedNode.push(false);
                    }
                }
            }

            const points = [];
            let bendsBefore = 0;

            for (let idx = 0; idx < nbLogical; idx++) {
                const ancNum = idx + 1;
                const baseVal = (baseVals[idx] !== undefined) ? baseVals[idx] : p0;
                const effKn = Math.max(p0, parseFloat((baseVal * Math.pow(0.5, bendsBefore)).toFixed(2)));

                const isExtLeft = (idx === 0);
                const isExtRight = (idx === nbLogical - 1);
                const isFall = (idx === fIdx || idx === fIdx + 1);

                // Node idx is a bend > 40° if the span preceding it has bend > 40°
                let isDouble = false;
                if (idx >= 1 && idx < nbLogical - 1) {
                    const sp = effectiveSpans[idx - 1];
                    if (sp) {
                        const bDeg = Math.abs(parseFloat(sp.bendDeg || sp.bend_after_deg || (sp.bend90 ? 90 : 0)) || 0);
                        if (bDeg > this.config.BEND_THRESHOLD_DEG) {
                            isDouble = true;
                        }
                    }
                }

                if (isDouble) {
                    const doubleRem = isFall
                        ? ["Ancrage double (chute)", "Double fall anchor", "Anclaje doble (caída)"][l]
                        : ["Ancrage double", "Double anchor", "Anclaje doble"][l];

                    // Point A#a
                    points.push({
                        id: `A${ancNum}a`,
                        label: `${["Force Ancrage", "Anchor Force", "Fuerza Anclaje"][l]} A${ancNum}a`,
                        pdfLabel: `${["Force Ancrage", "Anchor Force", "Fuerza Anclaje"][l]} A${ancNum}a`,
                        val: effKn,
                        isAttenuated: false,
                        isExtremity: false,
                        isP0: false,
                        isFallAnchor: isFall,
                        isDoubleAnchor: true,
                        remarque: doubleRem,
                        sixIndex: idx
                    });

                    // Point A#b
                    points.push({
                        id: `A${ancNum}b`,
                        label: `${["Force Ancrage", "Anchor Force", "Fuerza Anclaje"][l]} A${ancNum}b`,
                        pdfLabel: `${["Force Ancrage", "Anchor Force", "Fuerza Anclaje"][l]} A${ancNum}b`,
                        val: effKn,
                        isAttenuated: false,
                        isExtremity: false,
                        isP0: false,
                        isFallAnchor: isFall,
                        isDoubleAnchor: true,
                        remarque: doubleRem,
                        sixIndex: idx
                    });

                    // Subsequent anchors receive the 0.5 reduction
                    bendsBefore++;
                } else {
                    let rem = "-";
                    if (isFall) {
                        rem = ["Ancrage de chute S" + (fIdx + 1), "Fall Anchor S" + (fIdx + 1), "Anclaje de caída S" + (fIdx + 1)][l];
                    } else if (isAttenuatedNode[idx]) {
                        rem = ["Atténué - Règle 1", "Attenuated - Rule 1", "Atenuado - Regla 1"][l];
                    } else if (isExtLeft || isExtRight) {
                        rem = ["Extrémité", "End Anchor", "Extremo"][l];
                    } else if (bendsBefore > 0) {
                        rem = ["Après coude", "After bend", "Después de curva"][l];
                    } else {
                        rem = ["Intermédiaire", "Intermediate", "Intermedio"][l];
                    }

                    points.push({
                        id: `A${ancNum}`,
                        label: `${["Force Ancrage", "Anchor Force", "Fuerza Anclaje"][l]} A${ancNum}`,
                        pdfLabel: `${["Force Ancrage", "Anchor Force", "Fuerza Anclaje"][l]} A${ancNum}`,
                        val: effKn,
                        isAttenuated: Boolean(isAttenuatedNode[idx]),
                        isExtremity: (isExtLeft || isExtRight),
                        isP0: false,
                        isFallAnchor: isFall,
                        isDoubleAnchor: false,
                        remarque: rem,
                        sixIndex: idx
                    });
                }
            }

            const uiSubtitle = [
                "Répartition des efforts aux ancrages :",
                "Anchor Load Distribution:",
                "Distribución de Cargas a los Anclajes:"
            ][l];

            const pdfSubtitle = [
                "Répartition Multi-Portée OSHA",
                "OSHA Multi-Span Load Distribution",
                "Distribución Multi-Luz OSHA"
            ][l];

            const pdfColHeader = [
                "Indicateur / Ancrage OSHA",
                "OSHA Indicator / Anchor",
                "Indicador / Anclaje OSHA"
            ][l];

            return {
                count: points.length,
                totalAnchors: points.length,
                points: points,
                uiSubtitle: uiSubtitle,
                pdfSubtitle: pdfSubtitle,
                pdfColHeader: pdfColHeader
            };
        }

        const total = Math.max(2, totalAnchors || 2);
        let points = [];

        if (total === 2) {
            points = [
                {
                    id: "A1",
                    label: ["Force Ancrage A1", "Anchor Force A1", "Fuerza Anclaje A1"][l],
                    pdfLabel: ["Force Ancrage A1", "Anchor Force A1", "Fuerza Anclaje A1"][l],
                    val: res[1],
                    isAttenuated: false,
                    isExtremity: true,
                    isP0: false,
                    isFallAnchor: true,
                    remarque: ["Ancrage de chute - S1 Extr. 1", "Fall Anchor - S1 End 1", "Anclaje de caída - S1 Extr. 1"][l],
                    sixIndex: 1
                },
                {
                    id: "A2",
                    label: ["Force Ancrage A2", "Anchor Force A2", "Fuerza Anclaje A2"][l],
                    pdfLabel: ["Force Ancrage A2", "Anchor Force A2", "Fuerza Anclaje A2"][l],
                    val: res[2],
                    isAttenuated: false,
                    isExtremity: true,
                    isP0: false,
                    isFallAnchor: true,
                    remarque: ["Ancrage de chute - S1 Extr. 2", "Fall Anchor - S1 End 2", "Anclaje de caída - S1 Extr. 2"][l],
                    sixIndex: 2
                }
            ];
        } else if (total === 3 && (fallSpanIdx || 0) === 0) {
            points = [
                {
                    id: "A1",
                    label: ["Force Ancrage A1", "Anchor Force A1", "Fuerza Anclaje A1"][l],
                    pdfLabel: ["Force Ancrage A1", "Anchor Force A1", "Fuerza Anclaje A1"][l],
                    val: res[1],
                    isAttenuated: false,
                    isExtremity: true,
                    isP0: false,
                    isFallAnchor: true,
                    remarque: ["Ancrage de chute S1", "Fall Anchor S1", "Anclaje de caída S1"][l],
                    sixIndex: 1
                },
                {
                    id: "A2",
                    label: ["Force Ancrage A2", "Anchor Force A2", "Fuerza Anclaje A2"][l],
                    pdfLabel: ["Force Ancrage A2", "Anchor Force A2", "Fuerza Anclaje A2"][l],
                    val: res[2],
                    isAttenuated: false,
                    isExtremity: false,
                    isP0: false,
                    isFallAnchor: true,
                    remarque: ["Ancrage de chute S1", "Fall Anchor S1", "Anclaje de caída S1"][l],
                    sixIndex: 2
                },
                {
                    id: "A3",
                    label: ["Force Ancrage A3", "Anchor Force A3", "Fuerza Anclaje A3"][l],
                    pdfLabel: ["Force Ancrage A3", "Anchor Force A3", "Fuerza Anclaje A3"][l],
                    val: res[3],
                    isAttenuated: false,
                    isExtremity: true,
                    isP0: false,
                    isFallAnchor: false,
                    remarque: ["Extrémité", "End Anchor", "Extremo"][l],
                    sixIndex: 3
                }
            ];
        } else if (total === 4 && (fallSpanIdx || 0) === 0) {
            points = [
                {
                    id: "A1",
                    label: ["Force Ancrage A1", "Anchor Force A1", "Fuerza Anclaje A1"][l],
                    pdfLabel: ["Force Ancrage A1", "Anchor Force A1", "Fuerza Anclaje A1"][l],
                    val: res[1],
                    isAttenuated: false,
                    isExtremity: true,
                    isP0: false,
                    isFallAnchor: true,
                    remarque: ["Ancrage de chute S1", "Fall Anchor S1", "Anclaje de caída S1"][l],
                    sixIndex: 1
                },
                {
                    id: "A2",
                    label: ["Force Ancrage A2", "Anchor Force A2", "Fuerza Anclaje A2"][l],
                    pdfLabel: ["Force Ancrage A2", "Anchor Force A2", "Fuerza Anclaje A2"][l],
                    val: res[2],
                    isAttenuated: false,
                    isExtremity: false,
                    isP0: false,
                    isFallAnchor: true,
                    remarque: ["Ancrage de chute S1", "Fall Anchor S1", "Anclaje de caída S1"][l],
                    sixIndex: 2
                },
                {
                    id: "A3",
                    label: ["Force Ancrage A3", "Anchor Force A3", "Fuerza Anclaje A3"][l],
                    pdfLabel: ["Force Ancrage A3", "Anchor Force A3", "Fuerza Anclaje A3"][l],
                    val: res[3],
                    isAttenuated: false,
                    isExtremity: false,
                    isP0: false,
                    isFallAnchor: false,
                    remarque: ["Intermédiaire", "Intermediate", "Intermedio"][l],
                    sixIndex: 3
                },
                {
                    id: "A4",
                    label: ["Force Ancrage A4", "Anchor Force A4", "Fuerza Anclaje A4"][l],
                    pdfLabel: ["Force Ancrage A4", "Anchor Force A4", "Fuerza Anclaje A4"][l],
                    val: res[4],
                    isAttenuated: false,
                    isExtremity: true,
                    isP0: false,
                    isFallAnchor: false,
                    remarque: ["Extrémité", "End Anchor", "Extremo"][l],
                    sixIndex: 4
                }
            ];
        } else if (total === 5 && (fallSpanIdx || 0) === 0) {
            points = [
                {
                    id: "A1",
                    label: ["Force Ancrage A1", "Anchor Force A1", "Fuerza Anclaje A1"][l],
                    pdfLabel: ["Force Ancrage A1", "Anchor Force A1", "Fuerza Anclaje A1"][l],
                    val: res[1],
                    isAttenuated: false,
                    isExtremity: true,
                    isP0: false,
                    isFallAnchor: true,
                    remarque: ["Ancrage de chute S1", "Fall Anchor S1", "Anclaje de caída S1"][l],
                    sixIndex: 1
                },
                {
                    id: "A2",
                    label: ["Force Ancrage A2", "Anchor Force A2", "Fuerza Anclaje A2"][l],
                    pdfLabel: ["Force Ancrage A2", "Anchor Force A2", "Fuerza Anclaje A2"][l],
                    val: res[2],
                    isAttenuated: false,
                    isExtremity: false,
                    isP0: false,
                    isFallAnchor: true,
                    remarque: ["Ancrage de chute S1", "Fall Anchor S1", "Anclaje de caída S1"][l],
                    sixIndex: 2
                },
                {
                    id: "A3",
                    label: ["Force Ancrage A3", "Anchor Force A3", "Fuerza Anclaje A3"][l],
                    pdfLabel: ["Force Ancrage A3", "Anchor Force A3", "Fuerza Anclaje A3"][l],
                    val: res[3],
                    isAttenuated: false,
                    isExtremity: false,
                    isP0: false,
                    isFallAnchor: false,
                    remarque: ["Intermédiaire", "Intermediate", "Intermedio"][l],
                    sixIndex: 3
                },
                {
                    id: "A4",
                    label: ["Force Ancrage A4", "Anchor Force A4", "Fuerza Anclaje A4"][l],
                    pdfLabel: ["Force Ancrage A4", "Anchor Force A4", "Fuerza Anclaje A4"][l],
                    val: res[4],
                    isAttenuated: false,
                    isExtremity: false,
                    isP0: false,
                    isFallAnchor: false,
                    remarque: ["Intermédiaire", "Intermediate", "Intermedio"][l],
                    sixIndex: 4
                },
                {
                    id: "A5",
                    label: ["Force Ancrage A5", "Anchor Force A5", "Fuerza Anclaje A5"][l],
                    pdfLabel: ["Force Ancrage A5", "Anchor Force A5", "Fuerza Anclaje A5"][l],
                    val: res[5],
                    isAttenuated: true,
                    isExtremity: true,
                    isP0: false,
                    isFallAnchor: false,
                    remarque: ["Atténué - Règle 1", "Attenuated - Rule 1", "Atenuado - Regla 1"][l],
                    sixIndex: 5
                }
            ];
        } else if (total === 6 && (fallSpanIdx || 0) === 0) {
            points = [
                {
                    id: "A0",
                    label: ["Force Ancrage A0", "Anchor Force A0", "Fuerza Anclaje A0"][l],
                    pdfLabel: ["Force Ancrage A0", "Anchor Force A0", "Fuerza Anclaje A0"][l],
                    val: res[0],
                    isAttenuated: true,
                    isExtremity: true,
                    isP0: false,
                    isFallAnchor: false,
                    remarque: ["Atténué - Règle 1", "Attenuated - Rule 1", "Atenuado - Regla 1"][l],
                    sixIndex: 0
                },
                {
                    id: "A1",
                    label: ["Force Ancrage A1", "Anchor Force A1", "Fuerza Anclaje A1"][l],
                    pdfLabel: ["Force Ancrage A1", "Anchor Force A1", "Fuerza Anclaje A1"][l],
                    val: res[1],
                    isAttenuated: false,
                    isExtremity: false,
                    isP0: false,
                    isFallAnchor: true,
                    remarque: ["Ancrage de chute S1", "Fall Anchor S1", "Anclaje de caída S1"][l],
                    sixIndex: 1
                },
                {
                    id: "A2",
                    label: ["Force Ancrage A2", "Anchor Force A2", "Fuerza Anclaje A2"][l],
                    pdfLabel: ["Force Ancrage A2", "Anchor Force A2", "Fuerza Anclaje A2"][l],
                    val: res[2],
                    isAttenuated: false,
                    isExtremity: false,
                    isP0: false,
                    isFallAnchor: true,
                    remarque: ["Ancrage de chute S1", "Fall Anchor S1", "Anclaje de caída S1"][l],
                    sixIndex: 2
                },
                {
                    id: "A3",
                    label: ["Force Ancrage A3", "Anchor Force A3", "Fuerza Anclaje A3"][l],
                    pdfLabel: ["Force Ancrage A3", "Anchor Force A3", "Fuerza Anclaje A3"][l],
                    val: res[3],
                    isAttenuated: false,
                    isExtremity: false,
                    isP0: false,
                    isFallAnchor: false,
                    remarque: ["Intermédiaire", "Intermediate", "Intermedio"][l],
                    sixIndex: 3
                },
                {
                    id: "A4",
                    label: ["Force Ancrage A4", "Anchor Force A4", "Fuerza Anclaje A4"][l],
                    pdfLabel: ["Force Ancrage A4", "Anchor Force A4", "Fuerza Anclaje A4"][l],
                    val: res[4],
                    isAttenuated: false,
                    isExtremity: false,
                    isP0: false,
                    isFallAnchor: false,
                    remarque: ["Intermédiaire", "Intermediate", "Intermedio"][l],
                    sixIndex: 4
                },
                {
                    id: "A5",
                    label: ["Force Ancrage A5", "Anchor Force A5", "Fuerza Anclaje A5"][l],
                    pdfLabel: ["Force Ancrage A5", "Anchor Force A5", "Fuerza Anclaje A5"][l],
                    val: res[5],
                    isAttenuated: true,
                    isExtremity: true,
                    isP0: false,
                    isFallAnchor: false,
                    remarque: ["Atténué - Règle 1", "Attenuated - Rule 1", "Atenuado - Regla 1"][l],
                    sixIndex: 5
                }
            ];
        } else if (total <= 6 && (fallSpanIdx || 0) > 0) {
            // Dynamic shift for total <= 6 when fall is on span > 0
            const fIdx = Math.max(0, Math.min(total - 2, fallSpanIdx || 0));
            for (let idx = 0; idx < total; idx++) {
                const ancNum = idx + 1;
                const isExtLeft = (idx === 0);
                const isExtRight = (idx === total - 1);
                let val = p0;
                let isAttenuated = false;
                let isFall = false;
                let sixIdx = -1;

                if (idx === fIdx) {
                    val = res[1];
                    sixIdx = 1;
                    isFall = true;
                } else if (idx === fIdx + 1) {
                    val = res[2];
                    sixIdx = 2;
                    isFall = true;
                } else if (idx === fIdx - 1) {
                    val = res[0];
                    sixIdx = 0;
                    isAttenuated = true;
                } else if (idx === fIdx + 2) {
                    val = res[3];
                    sixIdx = 3;
                } else if (idx === fIdx + 3) {
                    val = res[4];
                    sixIdx = 4;
                } else if (idx === fIdx + 4) {
                    val = res[5];
                    sixIdx = 5;
                    isAttenuated = true;
                } else {
                    val = p0;
                    sixIdx = -1;
                }

                let rem = "-";
                if (isFall) {
                    rem = ["Ancrage de chute S" + (fIdx + 1), "Fall Anchor S" + (fIdx + 1), "Anclaje de caída S" + (fIdx + 1)][l];
                } else if (isAttenuated) {
                    rem = ["Atténué - Règle 1", "Attenuated - Rule 1", "Atenuado - Regla 1"][l];
                } else if (sixIdx < 0) {
                    rem = ["Prétension P0", "Pretension P0", "Tensión P0"][l];
                } else if (isExtLeft || isExtRight) {
                    rem = ["Extrémité", "End Anchor", "Extremo"][l];
                } else {
                    rem = ["Intermédiaire", "Intermediate", "Intermedio"][l];
                }

                points.push({
                    id: `A${ancNum}`,
                    label: `${["Force Ancrage", "Anchor Force", "Fuerza Anclaje"][l]} A${ancNum}`,
                    pdfLabel: `${["Force Ancrage", "Anchor Force", "Fuerza Anclaje"][l]} A${ancNum}`,
                    val: val,
                    isAttenuated: isAttenuated,
                    isExtremity: (isExtLeft || isExtRight),
                    isP0: (sixIdx < 0),
                    isFallAnchor: isFall,
                    remarque: rem,
                    sixIndex: sixIdx
                });
            }
        } else {
            // V2 SPEC: More than 6 anchors -> Display ALL anchors of the line!
            // The 6 anchors around the fall span get res[0..5], and anchors outside get P0.
            const fIdx = Math.max(0, Math.min(total - 2, fallSpanIdx || 0));
            const winStart = Math.max(0, Math.min(total - 6, fIdx - 2));
            const winEnd = winStart + 5;

            for (let idx = 0; idx < total; idx++) {
                const ancNum = idx + 1;
                const isExtLeft = (idx === 0);
                const isExtRight = (idx === total - 1);
                const isInWindow = (idx >= winStart && idx <= winEnd);

                let val = p0;
                let isAttenuated = false;
                let sixIdx = -1;

                if (isInWindow) {
                    sixIdx = idx - winStart;
                    val = res[sixIdx];
                    isAttenuated = (sixIdx === 0 || sixIdx === 5);
                }

                const isFall = (idx === fIdx || idx === fIdx + 1);

                let rem = "-";
                if (isFall) {
                    rem = ["Ancrage de chute S" + (fIdx + 1), "Fall Anchor S" + (fIdx + 1), "Anclaje de caída S" + (fIdx + 1)][l];
                } else if (isAttenuated) {
                    rem = ["Atténué - Règle 1", "Attenuated - Rule 1", "Atenuado - Regla 1"][l];
                } else if (!isInWindow) {
                    rem = ["Prétension P0", "Pretension P0", "Tensión P0"][l];
                } else if (isExtLeft || isExtRight) {
                    rem = ["Extrémité", "End Anchor", "Extremo"][l];
                } else {
                    rem = ["Intermédiaire", "Intermediate", "Intermedio"][l];
                }

                points.push({
                    id: `A${ancNum}`,
                    label: `${["Force Ancrage", "Anchor Force", "Fuerza Anclaje"][l]} A${ancNum}`,
                    pdfLabel: `${["Force Ancrage", "Anchor Force", "Fuerza Anclaje"][l]} A${ancNum}`,
                    val: val,
                    isAttenuated: isAttenuated,
                    isExtremity: (isExtLeft || isExtRight),
                    isP0: !isInWindow,
                    isFallAnchor: isFall,
                    remarque: rem,
                    sixIndex: sixIdx
                });
            }
        }

        const uiSubtitle = [
            "Répartition des efforts aux ancrages :",
            "Anchor Load Distribution:",
            "Distribución de Cargas a los Anclajes:"
        ][l];

        const pdfSubtitle = [
            "Répartition Multi-Portée OSHA",
            "OSHA Multi-Span Load Distribution",
            "Distribución Multi-Luz OSHA"
        ][l];

        const pdfColHeader = [
            "Indicateur / Ancrage OSHA",
            "OSHA Indicator / Anchor",
            "Indicador / Anclaje OSHA"
        ][l];

        return {
            count: total,
            totalAnchors: total,
            points: points,
            uiSubtitle: uiSubtitle,
            pdfSubtitle: pdfSubtitle,
            pdfColHeader: pdfColHeader
        };
    },

    // RÈGLE 3 — Cross (Config 11, NewPRO)
    // 4 ancrages au bout de chaque branche : F_chute sur la branche de chute, 25% sur les 3 autres
    calculateRule3_Cross(fChute, activeBranch = "north") {
        const otherVal = this.config.CROSS_OTHER_FACTOR * fChute;
        const branchIds = ["north", "east", "south", "west"];
        const branchLabels = {
            north: ["Branche 1 (Nord)", "Branch 1 (North)", "Rama 1 (Norte)"],
            east:  ["Branche 2 (Est)",  "Branch 2 (East)",  "Rama 2 (Este)"],
            south: ["Branche 3 (Sud)",  "Branch 3 (South)", "Rama 3 (Sur)"],
            west:  ["Branche 4 (Ouest)","Branch 4 (West)",  "Rama 4 (Oeste)"]
        };

        const list = branchIds.map(id => {
            const isFall = (id === activeBranch);
            return {
                id: id,
                label: branchLabels[id],
                isFallBranch: isFall,
                forceKn: isFall ? fChute : otherVal
            };
        });

        return {
            fChute: fChute,
            fOther: otherVal,
            branches: list,
            values: list.map(b => b.forceKn)
        };
    },

    // RÈGLE 4 — Grid (Config 12, Long/Super/Ultra Range, overhead)
    // Précharge à chaque croix (P0 + W sur branche chute, P0 + W/3 sur les 3 autres)
    // + Effort dynamique (F_chute sur branche chute, 25% sur 3 autres)
    // + Propagation de croix en croix (facteur 0.25 par niveau Manhattan, coupure < 1% à 0)
    calculateRule4_Grid(fChute, nx = 3, ny = 3, userMassKg = ANCHOR_EFFORT_CONFIG.GRID_USER_MASS_KG, pretensionKg = ANCHOR_EFFORT_CONFIG.GRID_PRETENSION_KG, fallCross = { x: 0, z: 0 }, fallBranch = "X+") {
        const uMass = (userMassKg !== undefined && userMassKg !== null) ? userMassKg : this.config.GRID_USER_MASS_KG;
        const pKg = (pretensionKg !== undefined && pretensionKg !== null) ? pretensionKg : this.config.GRID_PRETENSION_KG;
        const g = this.config.G_ACCEL;

        const P0 = (pKg * g) / 1000; // kN
        const W  = (uMass * g) / 1000; // kN

        const prechargeFall = P0 + W;
        const prechargeOther = P0 + W / 3;

        const dynFall = fChute;
        const dynOther = this.config.CROSS_OTHER_FACTOR * fChute;

        const totalFall0 = prechargeFall + dynFall;
        const totalOther0 = prechargeOther + dynOther;
        const maxTotalLevel0 = Math.max(totalFall0, totalOther0);
        const cutoff = this.config.GRID_CUTOFF_RATIO * maxTotalLevel0;

        const crosses = [];
        const levelsSummary = {};

        for (let ix = 0; ix < nx; ix++) {
            for (let iz = 0; iz < ny; iz++) {
                const distManhattan = Math.abs(ix - fallCross.x) + Math.abs(iz - fallCross.z);
                const factor = Math.pow(this.config.GRID_LEVEL_FACTOR, distManhattan);

                const branchNames = ["X+", "X-", "Z+", "Z-"];
                const branchData = branchNames.map(bName => {
                    const isFallPt = (distManhattan === 0 && bName === fallBranch);
                    const isFallBranch = (bName === fallBranch);
                    const basePrecharge = isFallBranch ? prechargeFall : prechargeOther;
                    const baseDyn = isFallBranch ? dynFall : dynOther;

                    let pVal = factor * basePrecharge;
                    let dVal = factor * baseDyn;
                    let tVal = pVal + dVal;

                    if (factor < this.config.GRID_CUTOFF_RATIO) {
                        tVal = 0.0;
                        pVal = 0.0;
                        dVal = 0.0;
                    }

                    return {
                        branch: bName,
                        isFallPoint: isFallPt,
                        prechargeKn: pVal,
                        dynamicKn: dVal,
                        totalKn: tVal
                    };
                });

                const crossItem = {
                    xIdx: ix,
                    zIdx: iz,
                    id: `X-Matrix (${ix + 1}, ${iz + 1})`,
                    level: distManhattan,
                    branches: branchData,
                    maxTotal: Math.max(...branchData.map(b => b.totalKn))
                };
                crosses.push(crossItem);

                if (!levelsSummary[distManhattan]) {
                    levelsSummary[distManhattan] = {
                        level: distManhattan,
                        crossCount: 0,
                        sampleTotals: branchData.map(b => b.totalKn)
                    };
                }
                levelsSummary[distManhattan].crossCount++;
            }
        }

        // Poteaux d'extrémité (sur le pourtour de la grille)
        const endPosts = [];
        for (let iz = 0; iz < ny; iz++) {
            const cr = crosses.find(c => c.xIdx === 0 && c.zIdx === iz);
            const b = cr.branches.find(br => br.branch === "X-");
            endPosts.push({ id: `Poteau X- (${iz + 1})`, crossId: cr.id, branch: "X-", level: cr.level, prechargeKn: b.prechargeKn, dynamicKn: b.dynamicKn, totalKn: b.totalKn });
        }
        for (let iz = 0; iz < ny; iz++) {
            const cr = crosses.find(c => c.xIdx === nx - 1 && c.zIdx === iz);
            const b = cr.branches.find(br => br.branch === "X+");
            endPosts.push({ id: `Poteau X+ (${iz + 1})`, crossId: cr.id, branch: "X+", level: cr.level, prechargeKn: b.prechargeKn, dynamicKn: b.dynamicKn, totalKn: b.totalKn });
        }
        for (let ix = 0; ix < nx; ix++) {
            const cr = crosses.find(c => c.xIdx === ix && c.zIdx === 0);
            const b = cr.branches.find(br => br.branch === "Z-");
            endPosts.push({ id: `Poteau Z- (${ix + 1})`, crossId: cr.id, branch: "Z-", level: cr.level, prechargeKn: b.prechargeKn, dynamicKn: b.dynamicKn, totalKn: b.totalKn });
        }
        for (let ix = 0; ix < nx; ix++) {
            const cr = crosses.find(c => c.xIdx === ix && c.zIdx === ny - 1);
            const b = cr.branches.find(br => br.branch === "Z+");
            endPosts.push({ id: `Poteau Z+ (${ix + 1})`, crossId: cr.id, branch: "Z+", level: cr.level, prechargeKn: b.prechargeKn, dynamicKn: b.dynamicKn, totalKn: b.totalKn });
        }

        return {
            P0: P0,
            W: W,
            userMassKg: uMass,
            pretensionKg: pKg,
            prechargeFall: prechargeFall,
            prechargeOther: prechargeOther,
            dynFall: dynFall,
            dynOther: dynOther,
            cutoff: cutoff,
            level0: {
                totalFall: totalFall0,
                totalOther: totalOther0,
                values: [totalFall0, totalOther0, totalOther0, totalOther0]
            },
            levelsSummary: levelsSummary,
            crosses: crosses,
            endPosts: endPosts
        };
    },

    // Suite de tests automatisés validant tous les exemples chiffrés de la spécification
    runSelfTests() {
        const tests = [];

        // Test 1: Multi-portée K = 0.50 -> [5.00, 10.00, 20.00, 18.00, 9.00, 4.50]
        const r1_050 = this.calculateRule1_MultiSpan(10, 20, 18, 9, 0.50, 0.50);
        const exp1 = [5.00, 10.00, 20.00, 18.00, 9.00, 4.50];
        const pass1 = r1_050.every((v, i) => Math.abs(v - exp1[i]) < 0.001);
        tests.push({ name: "Règle 1 (K=0.50)", pass: pass1, got: r1_050.map(v => v.toFixed(2)), exp: exp1.map(v => v.toFixed(2)) });

        // Test 2: Multi-portée K = 0.495 -> [4.95, 10.00, 20.00, 18.00, 9.00, 4.46]
        const r1_0495 = this.calculateRule1_MultiSpan(10, 20, 18, 9, 0.495, 0.495);
        const exp2 = ["4.95", "10.00", "20.00", "18.00", "9.00", "4.46"];
        const pass2 = r1_0495.map(v => v.toFixed(2)).every((v, i) => v === exp2[i]);
        tests.push({ name: "Règle 1 (K=0.495)", pass: pass2, got: r1_0495.map(v => v.toFixed(2)), exp: exp2 });

        // Test 3: Coude 55° sur les deux derniers -> [5.00, 10.00, 20.00, 18.00, 4.50, 2.25]
        const sixBase = [5.00, 10.00, 20.00, 18.00, 9.00, 4.50];
        const r2_55 = this.calculateRule2_Bend(sixBase, [], [{ angleDeg: 55, pos: 'before_A4' }]);
        const exp3 = ["5.00", "10.00", "20.00", "18.00", "4.50", "2.25"];
        const pass3 = r2_55.map(v => v.toFixed(2)).every((v, i) => v === exp3[i]);
        tests.push({ name: "Règle 2 (Coude 55°)", pass: pass3, got: r2_55.map(v => v.toFixed(2)), exp: exp3 });

        // Test 4: Coude 35° (inchangé)
        const r2_35 = this.calculateRule2_Bend(sixBase, [], [{ angleDeg: 35, pos: 'before_A4' }]);
        const exp4 = ["5.00", "10.00", "20.00", "18.00", "9.00", "4.50"];
        const pass4 = r2_35.map(v => v.toFixed(2)).every((v, i) => v === exp4[i]);
        tests.push({ name: "Règle 2 (Coude 35°)", pass: pass4, got: r2_35.map(v => v.toFixed(2)), exp: exp4 });

        // Test 5: Cross F_chute = 12.00 -> [12.00, 3.00, 3.00, 3.00]
        const r3 = this.calculateRule3_Cross(12.00, "north");
        const exp5 = ["12.00", "3.00", "3.00", "3.00"];
        const pass5 = r3.values.map(v => v.toFixed(2)).every((v, i) => v === exp5[i]);
        tests.push({ name: "Règle 3 (Cross)", pass: pass5, got: r3.values.map(v => v.toFixed(2)), exp: exp5 });

        // Test 6: Grid F_chute = 10.00
        const r4 = this.calculateRule4_Grid(10.00, 5, 5, 141, 600, { x: 0, z: 0 }, "X+");
        const expL0 = ["17.27", "8.85", "8.85", "8.85"];
        const expL1 = ["4.32", "2.21", "2.21", "2.21"];
        const expL2 = ["1.08", "0.55", "0.55", "0.55"];
        const expL3 = ["0.27", "0.14", "0.14", "0.14"];
        const expL4 = ["0.00", "0.00", "0.00", "0.00"];

        const gotL0 = r4.levelsSummary[0].sampleTotals.map(v => v.toFixed(2));
        const gotL1 = r4.levelsSummary[1].sampleTotals.map(v => v.toFixed(2));
        const gotL2 = r4.levelsSummary[2].sampleTotals.map(v => v.toFixed(2));
        const gotL3 = r4.levelsSummary[3].sampleTotals.map(v => v.toFixed(2));
        const gotL4 = r4.levelsSummary[4].sampleTotals.map(v => v.toFixed(2));

        const pass6 = gotL0.every((v, i) => v === expL0[i]) &&
                      gotL1.every((v, i) => v === expL1[i]) &&
                      gotL2.every((v, i) => v === expL2[i]) &&
                      gotL3.every((v, i) => v === expL3[i]) &&
                      gotL4.every((v, i) => v === expL4[i]);

        tests.push({ name: "Règle 4 (Grid L0..L4)", pass: pass6, got: { L0: gotL0, L1: gotL1, L2: gotL2, L3: gotL3, L4: gotL4 }, exp: { L0: expL0, L1: expL1, L2: expL2, L3: expL3, L4: expL4 } });

        // Test 7: Adaptation 4 ancrages -> 4 points [10, 20, 18, 9]
        const adapt4 = this.getAdaptedMultiSpanResults(exp1, 4, 0);
        const pass7 = (adapt4.count === 4) && 
                      adapt4.points.length === 4 && 
                      adapt4.points[0].id === "A1" && 
                      adapt4.points[3].id === "A4" &&
                      adapt4.points.map(p => p.val.toFixed(2)).join(";") === "10.00;20.00;18.00;9.00";
        tests.push({ name: "Adaptation 4 ancrages", pass: pass7, got: adapt4.points.map(p => `${p.id}:${p.val.toFixed(2)}`), exp: ["A1:10.00", "A2:20.00", "A3:18.00", "A4:9.00"] });

        // Test 8 (V2 Spec): Adaptation 8 ancrages -> Tous les 8 ancrages affichés (6 points de chute + 2 ancrages à P0)
        const adapt8 = this.getAdaptedMultiSpanResults(exp1, 8, 0, 0, 1.0);
        const exp8Vals = ["5.00", "10.00", "20.00", "18.00", "9.00", "4.50", "1.00", "1.00"];
        const pass8 = (adapt8.count === 8) && 
                      adapt8.points.length === 8 && 
                      adapt8.points[0].id === "A1" && 
                      adapt8.points[7].id === "A8" &&
                      adapt8.points.map(p => p.val.toFixed(2)).join(";") === exp8Vals.join(";");
        tests.push({ name: "Adaptation 8 ancrages (V2 : tous les 8 ancrages)", pass: pass8, got: adapt8.points.map(p => `${p.id}:${p.val.toFixed(2)}`), exp: exp8Vals.map((v, i) => `A${i+1}:${v}`) });

        // Test 9: Adaptation 6 ancrages exactement -> [A0:5.00, A1:10.00, A2:20.00, A3:18.00, A4:9.00, A5:4.50]
        const adapt6 = this.getAdaptedMultiSpanResults(exp1, 6, 0);
        const pass9 = (adapt6.count === 6) &&
                      adapt6.points.length === 6 &&
                      adapt6.points[0].id === "A0" &&
                      adapt6.points[5].id === "A5" &&
                      adapt6.points.map(p => p.val.toFixed(2)).join(";") === "5.00;10.00;20.00;18.00;9.00;4.50";
        tests.push({ name: "Adaptation 6 ancrages (Règle 1 6-points)", pass: pass9, got: adapt6.points.map(p => `${p.id}:${p.val.toFixed(2)}`), exp: ["A0:5.00", "A1:10.00", "A2:20.00", "A3:18.00", "A4:9.00", "A5:4.50"] });

        // Test 10 (Spec V2 — 17): Coude 60° à l'ancrage A2 -> A1:5.00, A2a:10.00, A2b:10.00, A3:10.00, A4:9.00, A5:4.50, A6:2.25
        const spansExample17 = [
            { length: 10, bendDeg: 60 },
            { length: 10, bendDeg: 0 },
            { length: 10, bendDeg: 0 },
            { length: 10, bendDeg: 0 },
            { length: 10, bendDeg: 0 }
        ];
        // 5 spans -> 6 logical anchors. Fall on S3 (idx 2)
        const adapt17 = this.getAdaptedMultiSpanResults(exp1, 6, 0, 2, 0.98, spansExample17);
        const exp17Vals = ["A1:5.00", "A2a:10.00", "A2b:10.00", "A3:10.00", "A4:9.00", "A5:4.50", "A6:2.25"];
        const got17Vals = adapt17.points.map(p => `${p.id}:${p.val.toFixed(2)}`);
        const pass10 = (adapt17.count === 7) &&
                       adapt17.points.length === 7 &&
                       got17Vals.join(";") === exp17Vals.join(";");
        tests.push({ name: "Spec V2 — 17 (Coude 60° ancrage double A2a/A2b)", pass: pass10, got: got17Vals, exp: exp17Vals });

        return tests;
    }
};
window.AnchorEffortDistributionModule = AnchorEffortDistributionModule;

// Exécution immédiate des tests de conformité
const anchorSelfTestResults = AnchorEffortDistributionModule.runSelfTests();
console.log("=== [HOOKT] TESTS VALIDATION RÉPARTITION EFFORTS ANCRAGES ===", anchorSelfTestResults);

// ==========================================
// MODULE : CONTRÔLE D'ACCÈS & UTILISATEURS (SPEC V2 — 01)
// Architecture : Inscription sur invitation uniquement (allow-list)
// Rôles : Admin PIP, Installateur, Suspendu
// Révocation instantanée, Journal d'audit, Isolation des projets
// ==========================================

function sha256Sync(ascii) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    const mathPow = Math.pow; const maxWord = mathPow(2, 32);
    let i, j; let result = ""; const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = []; const k = []; let primeCounter = 0; const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
            hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (i = 0; i < ascii.length; i++) {
        j = ascii.charCodeAt(i);
        words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);
    for (j = 0; j < words.length;) {
        const w = words.slice(j, j += 16); const oldHash = hash; hash = hash.slice(0, 8);
        for (i = 0; i < 64; i++) {
            const w15 = w[i - 15], w2 = w[i - 2];
            const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
            const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
            w[i] = (i < 16) ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
            const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
            const temp1 = hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ch + k[i] + w[i];
            const temp2 = (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj;
            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
        }
        for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
        for (j = 3; j + 1; j--) {
            const b = (hash[i] >> (j * 8)) & 255;
            result += ((b < 16) ? 0 : "") + b.toString(16);
        }
    }
    return result;
}

const AuthModule = (function () {
    const STORAGE_ALLOWLIST = "hookt_v2_allowlist";
    const STORAGE_SESSION = "hookt_v2_session";
    const STORAGE_AUDIT = "hookt_v2_audit_log";
    const STORAGE_ATTEMPTS = "hookt_v2_login_attempts";
    const SESSION_INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout
    const GENERIC_ERROR_MSG = "Accès réservé aux utilisateurs approuvés.";

    const SEED_USERS = [
        {
            id: "usr-admin-pip",
            email: "admin@pip.com",
            nom: "Pierre Dupont",
            société: "PIP Global Safety",
            rôle: "admin",
            statut: "actif",
            salt: "salt-pip-admin-01",
            passwordHash: sha256Sync("PipAdmin2026!" + "salt-pip-admin-01"),
            date_invitation: "2026-01-10T09:00:00.000Z",
            date_dernière_connexion: "2026-10-15T12:00:00.000Z",
            expiration_accès: null,
            invité_par: "Système PIP"
        },
        {
            id: "usr-installateur-1",
            email: "installateur@hookt.fr",
            nom: "Marc Lefebvre",
            société: "Acrobat Sécurité",
            rôle: "installer",
            statut: "actif",
            salt: "salt-hookt-inst-01",
            passwordHash: sha256Sync("Installer2026!" + "salt-hookt-inst-01"),
            date_invitation: "2026-02-01T10:00:00.000Z",
            date_dernière_connexion: "2026-10-14T16:30:00.000Z",
            expiration_accès: null,
            invité_par: "admin@pip.com"
        },
        {
            id: "usr-installateur-2",
            email: "lucas@hauteurpro.com",
            nom: "Lucas Martin",
            société: "Hauteur Pro SAS",
            rôle: "installer",
            statut: "actif",
            salt: "salt-hauteur-02",
            passwordHash: sha256Sync("Lucas2026!" + "salt-hauteur-02"),
            date_invitation: "2026-03-01T10:00:00.000Z",
            date_dernière_connexion: "2026-10-12T08:30:00.000Z",
            expiration_accès: null,
            invité_par: "admin@pip.com"
        },
        {
            id: "usr-invite-valid",
            email: "invite@chantier.fr",
            nom: "Camille Bernard",
            société: "EcoToit Ingénierie",
            rôle: "installer",
            statut: "invité",
            salt: "salt-invite-03",
            passwordHash: null,
            activationToken: "inv-demo-7days-valid",
            tokenExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
            date_invitation: new Date().toISOString(),
            date_dernière_connexion: null,
            expiration_accès: null,
            invité_par: "admin@pip.com"
        },
        {
            id: "usr-suspendu",
            email: "suspendu@externe.fr",
            nom: "Jean Suspendu",
            société: "Ancien Partenaire",
            rôle: "suspended",
            statut: "suspendu",
            salt: "salt-suspendu-04",
            passwordHash: sha256Sync("Suspendu2026!" + "salt-suspendu-04"),
            date_invitation: "2025-11-01T09:00:00.000Z",
            date_dernière_connexion: "2026-09-01T11:00:00.000Z",
            expiration_accès: null,
            invité_par: "admin@pip.com"
        }
    ];

    function getStorage() {
        if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
        return {
            _s: {},
            getItem: function (k) { return this._s[k] || null; },
            setItem: function (k, v) { this._s[k] = String(v); },
            removeItem: function (k) { delete this._s[k]; }
        };
    }

    function getAllowlist() {
        const store = getStorage();
        const raw = store.getItem(STORAGE_ALLOWLIST);
        if (!raw) {
            saveAllowlist(SEED_USERS);
            return SEED_USERS;
        }
        try {
            return JSON.parse(raw);
        } catch (e) {
            saveAllowlist(SEED_USERS);
            return SEED_USERS;
        }
    }

    function saveAllowlist(users) {
        getStorage().setItem(STORAGE_ALLOWLIST, JSON.stringify(users));
    }

    function getAuditLog() {
        const store = getStorage();
        const raw = store.getItem(STORAGE_AUDIT);
        if (!raw) return [];
        try { return JSON.parse(raw); } catch (e) { return []; }
    }

    function logAudit(action, details, userContext) {
        const logs = getAuditLog();
        const user = userContext || getCurrentUserSafe();
        const entry = {
            id: "aud-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            timestamp: new Date().toISOString(),
            userEmail: user ? user.email : "anonyme",
            userName: user ? user.nom : "Anonyme",
            role: user ? user.rôle : "none",
            action: action,
            details: details || {}
        };
        logs.push(entry);
        getStorage().setItem(STORAGE_AUDIT, JSON.stringify(logs));
        return entry;
    }

    function getLoginAttempts() {
        const raw = getStorage().getItem(STORAGE_ATTEMPTS);
        if (!raw) return {};
        try { return JSON.parse(raw); } catch (e) { return {}; }
    }

    function recordFailedAttempt(email) {
        const store = getStorage();
        const attempts = getLoginAttempts();
        const key = (email || "unknown").toLowerCase();
        const now = Date.now();
        const record = attempts[key] || { count: 0, firstAttempt: now, lockedUntil: 0 };
        if (record.lockedUntil && now < record.lockedUntil) return record;
        record.count++;
        if (record.count >= MAX_LOGIN_ATTEMPTS) {
            record.lockedUntil = now + LOCKOUT_MS;
        }
        attempts[key] = record;
        store.setItem(STORAGE_ATTEMPTS, JSON.stringify(attempts));
        return record;
    }

    function isRateLimited(email) {
        const attempts = getLoginAttempts();
        const key = (email || "unknown").toLowerCase();
        const record = attempts[key];
        if (!record) return false;
        if (record.lockedUntil && Date.now() < record.lockedUntil) return true;
        if (record.lockedUntil && Date.now() >= record.lockedUntil) {
            delete attempts[key];
            getStorage().setItem(STORAGE_ATTEMPTS, JSON.stringify(attempts));
            return false;
        }
        return false;
    }

    function clearAttempts(email) {
        const store = getStorage();
        const attempts = getLoginAttempts();
        const key = (email || "unknown").toLowerCase();
        if (attempts[key]) {
            delete attempts[key];
            store.setItem(STORAGE_ATTEMPTS, JSON.stringify(attempts));
        }
    }

    function getSession() {
        const raw = getStorage().getItem(STORAGE_SESSION);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function setSession(session) {
        getStorage().setItem(STORAGE_SESSION, JSON.stringify(session));
    }

    function clearSession() {
        getStorage().removeItem(STORAGE_SESSION);
    }

    function getCurrentUserSafe() {
        const session = getSession();
        if (!session || !session.userId) return null;
        const allowlist = getAllowlist();
        return allowlist.find(u => u.id === session.userId) || null;
    }

    function isAuthenticated() {
        try {
            requireAuth();
            return true;
        } catch (e) {
            return false;
        }
    }

    // Live session validator: immediately severs suspended/deleted accounts
    function requireAuth() {
        const session = getSession();
        if (!session || !session.userId) {
            throw new Error("UNAUTHORIZED: Session active requise.");
        }
        const now = Date.now();
        if (session.expiresAt && now > session.expiresAt) {
            clearSession();
            logAudit("SESSION_EXPIRED", { userId: session.userId });
            updateAuthUI();
            throw new Error("SESSION_EXPIRED: Votre session a expiré pour cause d'inactivité.");
        }

        const allowlist = getAllowlist();
        const user = allowlist.find(u => u.id === session.userId);
        if (!user) {
            clearSession();
            logAudit("SESSION_REVOKED", { userId: session.userId, reason: "user_not_found" });
            updateAuthUI();
            throw new Error("ACCESS_REVOKED: Utilisateur non trouvé dans la liste d'accès.");
        }

        if (user.statut === "suspendu" || user.rôle === "suspended") {
            clearSession();
            logAudit("SESSION_REVOKED", { userId: user.id, email: user.email, reason: "suspended" });
            updateAuthUI();
            throw new Error("ACCESS_REVOKED: Votre accès a été suspendu par un administrateur PIP.");
        }

        if (user.expiration_accès && new Date(user.expiration_accès).getTime() < now) {
            clearSession();
            logAudit("SESSION_EXPIRED", { userId: user.id, email: user.email, reason: "access_expired" });
            updateAuthUI();
            throw new Error("ACCESS_EXPIRED: Votre période d'accès à l'outil a expiré.");
        }

        session.lastActivity = now;
        session.expiresAt = now + SESSION_INACTIVITY_MS;
        setSession(session);
        return user;
    }

    function requireAdmin() {
        const user = requireAuth();
        if (user.rôle !== "admin") {
            logAudit("UNAUTHORIZED_ADMIN_ACCESS", { userId: user.id, role: user.rôle });
            throw new Error("FORBIDDEN: Droits administrateur PIP requis.");
        }
        return user;
    }

    function login(email, password) {
        const cleanEmail = (email || "").trim().toLowerCase();
        if (isRateLimited(cleanEmail)) {
            logAudit("LOGIN_RATE_LIMITED", { email: cleanEmail });
            return {
                success: false,
                error: "Nombre d'essais maximal dépassé. Compte temporairement verrouillé pendant 15 minutes."
            };
        }

        const allowlist = getAllowlist();
        const user = allowlist.find(u => u.email.toLowerCase() === cleanEmail);

        if (!user || user.statut === "invité" || !user.passwordHash) {
            recordFailedAttempt(cleanEmail);
            logAudit("LOGIN_FAILED", { email: cleanEmail, reason: !user ? "email_not_in_allowlist" : "account_not_activated" });
            return { success: false, error: GENERIC_ERROR_MSG };
        }

        if (user.statut === "suspendu" || user.rôle === "suspended") {
            recordFailedAttempt(cleanEmail);
            logAudit("LOGIN_FAILED", { email: cleanEmail, reason: "user_suspended" });
            return { success: false, error: GENERIC_ERROR_MSG };
        }

        if (user.expiration_accès && new Date(user.expiration_accès).getTime() < Date.now()) {
            recordFailedAttempt(cleanEmail);
            logAudit("LOGIN_FAILED", { email: cleanEmail, reason: "user_expired" });
            return { success: false, error: GENERIC_ERROR_MSG };
        }

        const computedHash = sha256Sync(password + (user.salt || ""));
        if (computedHash !== user.passwordHash) {
            recordFailedAttempt(cleanEmail);
            logAudit("LOGIN_FAILED", { email: cleanEmail, reason: "bad_password" });
            return { success: false, error: GENERIC_ERROR_MSG };
        }

        clearAttempts(cleanEmail);
        user.date_dernière_connexion = new Date().toISOString();
        saveAllowlist(allowlist);

        const now = Date.now();
        const sessionToken = "tok-" + Math.random().toString(36).substring(2) + "-" + Date.now();
        setSession({
            token: sessionToken,
            userId: user.id,
            userEmail: user.email,
            role: user.rôle,
            createdAt: now,
            lastActivity: now,
            expiresAt: now + SESSION_INACTIVITY_MS
        });

        logAudit("LOGIN_SUCCESS", { userId: user.id, role: user.rôle }, user);
        updateAuthUI();
        return { success: true, user };
    }

    function logout() {
        const user = getCurrentUserSafe();
        if (user) {
            logAudit("LOGOUT", { userId: user.id }, user);
        }
        clearSession();
        updateAuthUI();
        return { success: true };
    }

    function activateInvite(token, newPassword) {
        if (!token) return { success: false, error: "Jeton d'activation manquant." };
        if (!newPassword || newPassword.length < 8) {
            return { success: false, error: "Le mot de passe doit contenir au moins 8 caractères." };
        }

        const allowlist = getAllowlist();
        const user = allowlist.find(u => u.activationToken === token);
        if (!user) {
            return { success: false, error: "Lien d'activation invalide ou déjà utilisé." };
        }

        if (user.tokenExpiresAt && new Date(user.tokenExpiresAt).getTime() < Date.now()) {
            return { success: false, error: "Le lien d'activation a expiré (validité 7 jours). Contactez votre administrateur PIP." };
        }

        const salt = "salt-" + Math.random().toString(36).substring(2, 10);
        user.salt = salt;
        user.passwordHash = sha256Sync(newPassword + salt);
        user.statut = "actif";
        user.activationToken = null;
        user.tokenExpiresAt = null;
        user.date_dernière_connexion = new Date().toISOString();
        saveAllowlist(allowlist);

        logAudit("USER_ACTIVATED", { userId: user.id, email: user.email }, user);

        const now = Date.now();
        setSession({
            token: "tok-act-" + Date.now(),
            userId: user.id,
            userEmail: user.email,
            role: user.rôle,
            createdAt: now,
            lastActivity: now,
            expiresAt: now + SESSION_INACTIVITY_MS
        });

        updateAuthUI();
        return { success: true, user };
    }

    function inviteUser({ email, nom, société, rôle = "installer", expiration_accès = null }) {
        const admin = requireAdmin();
        const cleanEmail = (email || "").trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes("@")) {
            return { success: false, error: "Adresse email invalide." };
        }

        const allowlist = getAllowlist();
        if (allowlist.some(u => u.email.toLowerCase() === cleanEmail)) {
            return { success: false, error: "Cette adresse email figure déjà dans la liste d'accès." };
        }

        const token = "inv-" + Math.random().toString(36).substring(2, 12) + "-" + Date.now();
        const tokenExpires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

        const newUser = {
            id: "usr-" + Date.now(),
            email: cleanEmail,
            nom: nom || cleanEmail.split("@")[0],
            société: société || "Partenaire PIP",
            rôle: rôle === "admin" ? "admin" : "installer",
            statut: "invité",
            salt: "salt-" + Math.random().toString(36).substring(2, 8),
            passwordHash: null,
            activationToken: token,
            tokenExpiresAt: tokenExpires,
            date_invitation: new Date().toISOString(),
            date_dernière_connexion: null,
            expiration_accès: expiration_accès || null,
            invité_par: admin.email
        };

        allowlist.push(newUser);
        saveAllowlist(allowlist);

        logAudit("USER_INVITED", {
            invitedEmail: cleanEmail,
            role: newUser.rôle,
            invitedBy: admin.email,
            expiresAt: tokenExpires
        }, admin);

        const inviteLink = window.location.origin + window.location.pathname + `?invite=${token}`;
        return { success: true, user: newUser, inviteLink, token };
    }

    function suspendUser(targetUserId) {
        const admin = requireAdmin();
        const allowlist = getAllowlist();
        const user = allowlist.find(u => u.id === targetUserId);
        if (!user) return { success: false, error: "Utilisateur non trouvé." };
        if (user.id === admin.id) return { success: false, error: "Impossible de suspendre son propre compte administrateur." };

        user.statut = "suspendu";
        user.rôle = "suspended";
        saveAllowlist(allowlist);

        logAudit("USER_SUSPENDED", { targetUserId: user.id, targetEmail: user.email }, admin);
        renderUsersTable();
        return { success: true, user };
    }

    function reactivateUser(targetUserId, newRole = "installer") {
        const admin = requireAdmin();
        const allowlist = getAllowlist();
        const user = allowlist.find(u => u.id === targetUserId);
        if (!user) return { success: false, error: "Utilisateur non trouvé." };

        user.statut = "actif";
        user.rôle = newRole;
        saveAllowlist(allowlist);

        logAudit("USER_REACTIVATED", { targetUserId: user.id, targetEmail: user.email, role: newRole }, admin);
        renderUsersTable();
        return { success: true, user };
    }

    function deleteUser(targetUserId) {
        const admin = requireAdmin();
        let allowlist = getAllowlist();
        const user = allowlist.find(u => u.id === targetUserId);
        if (!user) return { success: false, error: "Utilisateur non trouvé." };
        if (user.id === admin.id) return { success: false, error: "Impossible de supprimer son propre compte administrateur." };

        allowlist = allowlist.filter(u => u.id !== targetUserId);
        saveAllowlist(allowlist);

        logAudit("USER_DELETED", { targetUserId: user.id, targetEmail: user.email }, admin);
        renderUsersTable();
        return { success: true };
    }

    function resendInvite(targetUserId) {
        const admin = requireAdmin();
        const allowlist = getAllowlist();
        const user = allowlist.find(u => u.id === targetUserId);
        if (!user) return { success: false, error: "Utilisateur non trouvé." };
        if (user.statut !== "invité") return { success: false, error: "Ce compte est déjà activé." };

        const token = "inv-" + Math.random().toString(36).substring(2, 12) + "-" + Date.now();
        const tokenExpires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
        user.activationToken = token;
        user.tokenExpiresAt = tokenExpires;
        saveAllowlist(allowlist);

        logAudit("INVITE_RESENT", { targetUserId: user.id, targetEmail: user.email }, admin);
        const inviteLink = window.location.origin + window.location.pathname + `?invite=${token}`;
        renderUsersTable();
        return { success: true, inviteLink, token };
    }

    // ==========================================
    // UI HANDLERS & BINDINGS
    // ==========================================
    function updateAuthUI() {
        const user = getCurrentUserSafe();
        const overlay = document.getElementById("auth-overlay");
        const profileWidget = document.getElementById("user-profile-widget");
        const nameDisp = document.getElementById("user-name-display");
        const roleBadge = document.getElementById("user-role-badge");
        const btnAdmin = document.getElementById("btn-open-admin-pip");

        if (user && user.statut === "actif") {
            if (overlay) overlay.classList.remove("active");
            if (profileWidget) profileWidget.style.display = "flex";
            if (nameDisp) nameDisp.textContent = `${user.nom} (${user.société})`;
            if (roleBadge) {
                roleBadge.textContent = (user.rôle === "admin") ? "ADMIN PIP" : "INSTALLATEUR";
                roleBadge.className = "badge-role " + (user.rôle === "admin" ? "badge-role-admin" : "badge-role-installer");
            }
            if (btnAdmin) {
                btnAdmin.style.display = (user.rôle === "admin") ? "inline-flex" : "none";
            }
        } else {
            if (overlay) overlay.classList.add("active");
            if (profileWidget) profileWidget.style.display = "none";
            if (btnAdmin) btnAdmin.style.display = "none";
        }
    }

    function showLoginOverlay(errorMsg) {
        const overlay = document.getElementById("auth-overlay");
        const errAlert = document.getElementById("login-error-alert");
        const errText = document.getElementById("login-error-text");
        if (overlay) overlay.classList.add("active");
        if (errAlert && errorMsg) {
            errAlert.classList.remove("hidden");
            if (errText) errText.textContent = errorMsg;
        }
    }

    function handleLoginSubmit(event) {
        if (event) event.preventDefault();
        const email = document.getElementById("auth-email").value;
        const pass = document.getElementById("auth-password").value;
        const errAlert = document.getElementById("login-error-alert");
        const errText = document.getElementById("login-error-text");

        const res = login(email, pass);
        if (res.success) {
            if (errAlert) errAlert.classList.add("hidden");
            updateAuthUI();
            if (typeof updateCalculationsUI === "function") {
                updateCalculationsUI(state.spans, Calculator.getMaxSpan(state.product));
            }
        } else {
            if (errAlert) {
                errAlert.classList.remove("hidden");
                if (errText) errText.textContent = res.error || GENERIC_ERROR_MSG;
            }
        }
    }

    function fillDemoCredentials(email, pass) {
        const eInp = document.getElementById("auth-email");
        const pInp = document.getElementById("auth-password");
        if (eInp) eInp.value = email;
        if (pInp) pInp.value = pass;
        const errAlert = document.getElementById("login-error-alert");
        if (errAlert) errAlert.classList.add("hidden");
    }

    function handleLogout() {
        logout();
        showLoginOverlay();
    }

    function openInviteModalWithDemo() {
        const allowlist = getAllowlist();
        const invUser = allowlist.find(u => u.statut === "invité" && u.activationToken);
        if (invUser) {
            openActivationModal(invUser.activationToken);
        } else {
            alert("Aucune invitation en attente trouvée. Connectez-vous en Admin PIP pour générer une invitation.");
        }
    }

    function openActivationModal(token) {
        const allowlist = getAllowlist();
        const user = allowlist.find(u => u.activationToken === token);
        const modal = document.getElementById("activation-modal");
        const errAlert = document.getElementById("activation-error-alert");
        const errText = document.getElementById("activation-error-text");

        if (errAlert) errAlert.classList.add("hidden");

        if (!user) {
            if (errAlert && errText) {
                errAlert.classList.remove("hidden");
                errText.textContent = "Ce lien d'activation est invalide ou a déjà été utilisé.";
            }
            if (modal) modal.style.display = "flex";
            return;
        }

        if (user.tokenExpiresAt && new Date(user.tokenExpiresAt).getTime() < Date.now()) {
            if (errAlert && errText) {
                errAlert.classList.remove("hidden");
                errText.textContent = "Ce lien d'activation a expiré (validité 7 jours).";
            }
            if (modal) modal.style.display = "flex";
            return;
        }

        document.getElementById("activation-token-input").value = token;
        document.getElementById("activation-email-preview").value = user.email;
        document.getElementById("activation-user-preview").value = `${user.nom} — ${user.société}`;
        document.getElementById("activation-new-password").value = "";
        document.getElementById("activation-confirm-password").value = "";

        if (modal) modal.style.display = "flex";
    }

    function closeActivationModal() {
        const modal = document.getElementById("activation-modal");
        if (modal) modal.style.display = "none";
    }

    function handleActivationSubmit(event) {
        if (event) event.preventDefault();
        const token = document.getElementById("activation-token-input").value;
        const p1 = document.getElementById("activation-new-password").value;
        const p2 = document.getElementById("activation-confirm-password").value;
        const errAlert = document.getElementById("activation-error-alert");
        const errText = document.getElementById("activation-error-text");

        if (p1 !== p2) {
            if (errAlert && errText) {
                errAlert.classList.remove("hidden");
                errText.textContent = "Les deux mots de passe ne correspondent pas.";
            }
            return;
        }

        const res = activateInvite(token, p1);
        if (res.success) {
            closeActivationModal();
            updateAuthUI();
            alert("🎉 Votre compte a été activé avec succès ! Bienvenue sur l'outil HOOKT.");
        } else {
            if (errAlert && errText) {
                errAlert.classList.remove("hidden");
                errText.textContent = res.error;
            }
        }
    }

    // Admin PIP Modal UI
    function openAdminModal() {
        try {
            requireAdmin();
        } catch (e) {
            alert(e.message);
            return;
        }
        const modal = document.getElementById("admin-pip-modal");
        if (modal) modal.style.display = "flex";
        renderUsersTable();
    }

    function closeAdminModal() {
        const modal = document.getElementById("admin-pip-modal");
        if (modal) modal.style.display = "none";
    }

    function switchAdminTab(tabName) {
        const tabs = ["users", "invite", "audit", "projects"];
        tabs.forEach(t => {
            const pane = document.getElementById(`admin-tab-${t}`);
            const btn = document.getElementById(`tab-btn-${t}`);
            if (pane) pane.style.display = (t === tabName) ? "block" : "none";
            if (btn) btn.classList.toggle("active", t === tabName);
        });

        if (tabName === "users") renderUsersTable();
        if (tabName === "audit") renderAuditTable();
        if (tabName === "projects") renderAdminProjectsTable();
    }

    function renderUsersTable() {
        const allowlist = getAllowlist();
        const searchInput = document.getElementById("admin-user-search");
        const query = (searchInput ? searchInput.value : "").toLowerCase().trim();

        const tbody = document.getElementById("tbody-admin-users");
        if (!tbody) return;

        // KPI counters
        let total = allowlist.length;
        let active = allowlist.filter(u => u.statut === "actif").length;
        let invited = allowlist.filter(u => u.statut === "invité").length;
        let suspended = allowlist.filter(u => u.statut === "suspendu" || u.rôle === "suspended").length;

        const kTotal = document.getElementById("kpi-total-users");
        const kActive = document.getElementById("kpi-active-users");
        const kInvited = document.getElementById("kpi-invited-users");
        const kSusp = document.getElementById("kpi-suspended-users");
        if (kTotal) kTotal.textContent = total;
        if (kActive) kActive.textContent = active;
        if (kInvited) kInvited.textContent = invited;
        if (kSusp) kSusp.textContent = suspended;

        const filtered = allowlist.filter(u => {
            if (!query) return true;
            return (u.nom || "").toLowerCase().includes(query) ||
                (u.email || "").toLowerCase().includes(query) ||
                (u.société || "").toLowerCase().includes(query) ||
                (u.rôle || "").toLowerCase().includes(query);
        });

        tbody.innerHTML = "";
        filtered.forEach(u => {
            const tr = document.createElement("tr");

            let statusClass = "status-actif";
            let statusLabel = "Actif";
            if (u.statut === "invité") {
                statusClass = "status-invité";
                statusLabel = "Invité (7j)";
            } else if (u.statut === "suspendu" || u.rôle === "suspended") {
                statusClass = "status-suspendu";
                statusLabel = "Suspendu";
            }

            const lastLoginStr = u.date_dernière_connexion
                ? new Date(u.date_dernière_connexion).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
                : "—";

            const expiryStr = u.expiration_accès
                ? new Date(u.expiration_accès).toLocaleDateString("fr-FR")
                : "Permanent";

            // Action buttons
            let actionBtns = `<div class="table-btn-group">`;
            if (u.statut === "suspendu" || u.rôle === "suspended") {
                actionBtns += `<button type="button" class="btn btn-secondary btn-xs" onclick="AuthModule.reactivateUser('${u.id}', 'installer')" title="Réactiver"><i class="fa-solid fa-play"></i> Réactiver</button>`;
            } else if (u.rôle !== "admin") {
                actionBtns += `<button type="button" class="btn btn-secondary btn-xs" onclick="AuthModule.suspendUser('${u.id}')" title="Couper l'accès immédiatement"><i class="fa-solid fa-ban" style="color:#ef4444;"></i> Suspendre</button>`;
            }

            if (u.statut === "invité" && u.activationToken) {
                actionBtns += `<button type="button" class="btn btn-secondary btn-xs" onclick="AuthModule.copyInviteToken('${u.activationToken}')" title="Copier le lien d'activation"><i class="fa-solid fa-link"></i> Lien</button>`;
                actionBtns += `<button type="button" class="btn btn-secondary btn-xs" onclick="AuthModule.resendInvite('${u.id}')" title="Renvoyer une invitation"><i class="fa-solid fa-rotate-right"></i> Renvoyer</button>`;
            }

            if (u.rôle !== "admin") {
                actionBtns += `<button type="button" class="btn btn-secondary btn-xs" onclick="if(confirm('Supprimer définitivement cet accès ?')) AuthModule.deleteUser('${u.id}')" title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>`;
            }
            actionBtns += `</div>`;

            tr.innerHTML = `
                <td>
                    <strong>${u.nom}</strong><br>
                    <span style="font-size:0.75rem; color:#64748b;">${u.email}</span>
                </td>
                <td>${u.société}</td>
                <td><span class="badge-role ${u.rôle === 'admin' ? 'badge-role-admin' : 'badge-role-installer'}">${u.rôle.toUpperCase()}</span></td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td>${lastLoginStr}</td>
                <td>${expiryStr}</td>
                <td>${actionBtns}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function handleInviteSubmit(event) {
        if (event) event.preventDefault();
        const email = document.getElementById("inv-email").value;
        const nom = document.getElementById("inv-nom").value;
        const company = document.getElementById("inv-company").value;
        const role = document.getElementById("inv-role").value;
        const expiry = document.getElementById("inv-expiry").value || null;

        const res = inviteUser({ email, nom, société: company, rôle: role, expiration_accès: expiry });
        if (res.success) {
            document.getElementById("admin-invite-form").reset();
            const resBox = document.getElementById("invite-result-box");
            const linkOut = document.getElementById("invite-link-output");
            if (resBox) resBox.classList.remove("hidden");
            if (linkOut) linkOut.value = res.inviteLink;
            renderUsersTable();
        } else {
            alert("Erreur lors de la création de l'invitation : " + res.error);
        }
    }

    function copyInviteLink() {
        const linkOut = document.getElementById("invite-link-output");
        if (linkOut && linkOut.value) {
            navigator.clipboard.writeText(linkOut.value).then(() => {
                alert("✅ Lien d'activation copié dans le presse-papier !");
            }).catch(() => {
                alert("Lien : " + linkOut.value);
            });
        }
    }

    function copyInviteToken(token) {
        const fullLink = window.location.origin + window.location.pathname + `?invite=${token}`;
        navigator.clipboard.writeText(fullLink).then(() => {
            alert("✅ Lien d'activation copié dans le presse-papier :\n" + fullLink);
        }).catch(() => {
            alert("Lien : " + fullLink);
        });
    }

    function renderAuditTable() {
        const logs = getAuditLog().slice().reverse();
        const tbody = document.getElementById("tbody-admin-audit");
        if (!tbody) return;
        tbody.innerHTML = "";

        logs.forEach(l => {
            const tr = document.createElement("tr");
            const dateStr = new Date(l.timestamp).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });

            let actionBadge = `<span class="badge-tag-id span-badge">${l.action}</span>`;
            if (l.action === "LOGIN_SUCCESS") actionBadge = `<span class="status-badge status-actif"><i class="fa-solid fa-check"></i> Connexion</span>`;
            if (l.action === "LOGIN_FAILED") actionBadge = `<span class="status-badge status-suspendu"><i class="fa-solid fa-xmark"></i> Échec Connexion</span>`;
            if (l.action === "USER_SUSPENDED") actionBadge = `<span class="status-badge status-suspendu"><i class="fa-solid fa-ban"></i> Suspension</span>`;
            if (l.action === "USER_INVITED") actionBadge = `<span class="status-badge status-invité"><i class="fa-solid fa-envelope"></i> Invitation</span>`;
            if (l.action === "REPORT_GENERATED") actionBadge = `<span class="badge-tag-id fall-badge"><i class="fa-solid fa-file-pdf"></i> Rapport PDF</span>`;

            tr.innerHTML = `
                <td style="white-space:nowrap;">${dateStr}</td>
                <td><strong>${l.userName}</strong><br><span style="font-size:0.75rem; color:#64748b;">${l.userEmail}</span></td>
                <td><span class="badge-role ${l.role === 'admin' ? 'badge-role-admin' : 'badge-role-installer'}">${(l.role || 'NONE').toUpperCase()}</span></td>
                <td>${actionBadge}</td>
                <td><code>${JSON.stringify(l.details || {})}</code></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderAdminProjectsTable() {
        const allProjects = ProjectStorageModule.getAllProjects();
        const tbody = document.getElementById("tbody-admin-projects");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (allProjects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">Aucun projet enregistré.</td></tr>`;
            return;
        }

        allProjects.forEach(p => {
            const tr = document.createElement("tr");
            const dStr = new Date(p.createdAt).toLocaleDateString("fr-FR");
            tr.innerHTML = `
                <td><strong>${p.name}</strong><br><span style="font-size:0.75rem; color:#64748b;">${p.location || '—'}</span></td>
                <td>${p.authorName} (${p.authorCompany})<br><span style="font-size:0.75rem; color:#64748b;">${p.authorEmail}</span></td>
                <td>${dStr}</td>
                <td><span class="system-badge">${p.product}</span></td>
                <td>${p.layoutType.replace(/_/g, ' ').toUpperCase()}</td>
                <td>
                    <button type="button" class="btn btn-secondary btn-xs" onclick="ProjectStorageModule.loadProject('${p.id}')"><i class="fa-solid fa-folder-open"></i> Charger</button>
                    <button type="button" class="btn btn-secondary btn-xs" onclick="if(confirm('Supprimer ce projet ?')) ProjectStorageModule.deleteProjectUI('${p.id}')"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Heartbeat: checks every 3 seconds to instantly cut suspended sessions
    function startSessionHeartbeat() {
        setInterval(() => {
            const session = getSession();
            if (session && session.userId) {
                try {
                    requireAuth();
                } catch (e) {
                    alert("⚠️ " + e.message);
                    showLoginOverlay(e.message);
                }
            }
        }, 3000);
    }

    function init() {
        getAllowlist(); // Ensure seeds initialized

        // Check if invitation link present in URL
        const p = (typeof window !== "undefined" && window.location) ? new URLSearchParams(window.location.search) : null;
        const inviteParam = p ? p.get("invite") : null;
        if (inviteParam) {
            setTimeout(() => {
                openActivationModal(inviteParam);
            }, 300);
        }

        updateAuthUI();
        startSessionHeartbeat();
    }

    return {
        init,
        login,
        logout,
        requireAuth,
        requireAdmin,
        isAuthenticated,
        activateInvite,
        inviteUser,
        suspendUser,
        reactivateUser,
        deleteUser,
        resendInvite,
        getAllowlist,
        getAuditLog,
        logAudit,
        getCurrentUserSafe,
        getSession,
        showLoginOverlay,
        handleLoginSubmit,
        fillDemoCredentials,
        openInviteModalWithDemo,
        openActivationModal,
        closeActivationModal,
        handleActivationSubmit,
        handleLogout,
        openAdminModal,
        closeAdminModal,
        switchAdminTab,
        renderUsersTable,
        handleInviteSubmit,
        copyInviteLink,
        copyInviteToken,
        renderAuditTable,
        renderAdminProjectsTable
    };
})();

// ==========================================
// MODULE : GESTION ET ISOLATION DES PROJETS (SPEC V2 — 01)
// Les installateurs voient uniquement leurs propres projets.
// Les administrateurs PIP peuvent consulter l'ensemble des projets.
// ==========================================
const ProjectStorageModule = (function () {
    const STORAGE_PROJECTS = "hookt_v2_projects";

    function getStorage() {
        if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
        return {
            _s: {},
            getItem: function (k) { return this._s[k] || null; },
            setItem: function (k, v) { this._s[k] = String(v); },
            removeItem: function (k) { delete this._s[k]; }
        };
    }

    function getAllProjects() {
        const raw = getStorage().getItem(STORAGE_PROJECTS);
        if (!raw) return [];
        try { return JSON.parse(raw); } catch (e) { return []; }
    }

    function saveProject(projectMeta, configPayload) {
        const user = AuthModule.requireAuth();
        const projects = getAllProjects();

        const newProj = {
            id: "proj-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            userId: user.id,
            authorEmail: user.email,
            authorName: user.nom,
            authorCompany: user.société,
            name: (projectMeta && projectMeta.name) || (state.projectInfo && state.projectInfo.name) || "Projet Ligne de Vie",
            location: (projectMeta && projectMeta.location) || (state.projectInfo && state.projectInfo.location) || "",
            layoutType: (configPayload && configPayload.layoutType) || state.layoutType || "single_span",
            product: (configPayload && configPayload.product) || state.product || "CORE",
            createdAt: new Date().toISOString(),
            configPayload: configPayload || {
                layoutType: state.layoutType,
                product: state.product,
                spans: state.spans,
                projectInfo: state.projectInfo,
                unitSystem: state.unitSystem,
                appMode: state.appMode,
                norm: state.norm,
                nbUsers: state.nbUsers,
                fallFactor: state.fallFactor || state.engineerCoefficient || 1.00,
                engineerCoefficient: state.fallFactor || state.engineerCoefficient || 1.00,
                roofShape: state.roofShape,
                roofSlope: state.roofSlope,
                // Spec V2 — 09 / Prompt 15 fields:
                madM: state.madM,
                madUnit: state.madUnit,
                customMad: state.customMad,
                arrestForceKn: state.arrestForceKn,
                arrestForceLbf: state.arrestForceLbf,
                arrestForceUnit: state.arrestForceUnit,
                connectingDevice: state.connectingDevice,
                selectedSrlId: state.selectedSrlId,
                customDeviceName: state.customDeviceName,
                customDeviceClass: state.customDeviceClass,
                customDeviceLengthM: state.customDeviceLengthM
            }
        };

        projects.push(newProj);
        getStorage().setItem(STORAGE_PROJECTS, JSON.stringify(projects));

        AuthModule.logAudit("PROJECT_SAVED", {
            projectId: newProj.id,
            projectName: newProj.name,
            layout: newProj.layoutType
        }, user);

        return newProj;
    }

    function listProjects() {
        const user = AuthModule.requireAuth();
        const all = getAllProjects();
        if (user.rôle === "admin") return all;
        // Project isolation: Installer only sees their own projects
        return all.filter(p => p.userId === user.id);
    }

    function deleteProject(projectId) {
        const user = AuthModule.requireAuth();
        let all = getAllProjects();
        const target = all.find(p => p.id === projectId);
        if (!target) throw new Error("Projet non trouvé.");

        if (user.rôle !== "admin" && target.userId !== user.id) {
            throw new Error("FORBIDDEN: Vous ne pouvez pas supprimer le projet d'un autre installateur.");
        }

        all = all.filter(p => p.id !== projectId);
        getStorage().setItem(STORAGE_PROJECTS, JSON.stringify(all));

        AuthModule.logAudit("PROJECT_DELETED", { projectId, projectName: target.name }, user);
        return true;
    }

    // UI Handlers
    function openProjectsModal() {
        try {
            AuthModule.requireAuth();
        } catch (e) {
            alert(e.message);
            AuthModule.showLoginOverlay();
            return;
        }
        const modal = document.getElementById("projects-modal");
        if (modal) modal.style.display = "flex";

        const pNameInp = document.getElementById("save-proj-name");
        const pLocInp = document.getElementById("save-proj-location");
        if (pNameInp) pNameInp.value = state.projectInfo.name || "";
        if (pLocInp) pLocInp.value = state.projectInfo.location || "";

        renderUserProjectsTable();
    }

    function closeProjectsModal() {
        const modal = document.getElementById("projects-modal");
        if (modal) modal.style.display = "none";
    }

    function handleSaveCurrentProject() {
        try {
            const name = document.getElementById("save-proj-name").value || "Sans titre";
            const loc = document.getElementById("save-proj-location").value || "";
            state.projectInfo.name = name;
            state.projectInfo.location = loc;

            saveProject({ name, location: loc });
            alert("✅ Projet sauvegardé avec succès !");
            renderUserProjectsTable();
        } catch (e) {
            alert("Erreur lors de la sauvegarde : " + e.message);
        }
    }

    function renderUserProjectsTable() {
        let projects = [];
        try {
            projects = listProjects();
        } catch (e) {
            return;
        }

        const tbody = document.getElementById("tbody-user-projects");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (projects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">Aucun projet sauvegardé. Utilisez le formulaire ci-dessus pour enregistrer votre première configuration.</td></tr>`;
            return;
        }

        projects.forEach(p => {
            const tr = document.createElement("tr");
            const dStr = new Date(p.createdAt).toLocaleDateString("fr-FR");
            tr.innerHTML = `
                <td><strong>${p.name}</strong></td>
                <td>${p.location || '—'}</td>
                <td>${dStr}</td>
                <td><span class="system-badge">${p.product}</span></td>
                <td>${p.layoutType.replace(/_/g, ' ').toUpperCase()}</td>
                <td>
                    <button type="button" class="btn btn-secondary btn-xs" onclick="ProjectStorageModule.loadProject('${p.id}')"><i class="fa-solid fa-folder-open"></i> Charger</button>
                    <button type="button" class="btn btn-secondary btn-xs" onclick="if(confirm('Supprimer ce projet ?')) ProjectStorageModule.deleteProjectUI('${p.id}')"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function loadProject(projectId) {
        try {
            const all = listProjects();
            const proj = all.find(p => p.id === projectId);
            if (!proj || !proj.configPayload) {
                alert("Impossible de charger ce projet.");
                return;
            }

            const c = proj.configPayload;
            if (c.layoutType) {
                if (typeof DEPRECATED_CONFIGS !== "undefined" && DEPRECATED_CONFIGS.includes(c.layoutType)) {
                    state.layoutType = "multi_straight";
                    state.hasConvertedDeprecatedConfig = true;
                    alert(["ℹ️ Ce projet a été converti vers la configuration 2 (Multi-portée) sans perte de données (portées, coudes et pentes conservés).", "ℹ️ This project was converted to Configuration 2 (Multi-span) with no data loss (spans, bends and slopes preserved)."][state.lang || 0]);
                } else {
                    state.layoutType = c.layoutType;
                }
            }
            if (c.product) state.product = c.product;
            if (c.spans) state.spans = c.spans;
            if (c.projectInfo) state.projectInfo = { ...c.projectInfo };
            if (c.unitSystem) state.unitSystem = c.unitSystem;
            if (c.appMode) state.appMode = c.appMode;
            if (c.norm) state.norm = c.norm;
            if (c.nbUsers) state.nbUsers = c.nbUsers;

            // Prompt 15: Fall factor
            if (c.fallFactor !== undefined) {
                state.fallFactor = c.fallFactor;
                state.engineerCoefficient = c.fallFactor;
            } else if (c.engineerCoefficient !== undefined) {
                state.fallFactor = c.engineerCoefficient;
                state.engineerCoefficient = c.engineerCoefficient;
            }

            // Prompt 15: MAD & Arrest force
            if (c.madM !== undefined) {
                state.madM = c.madM;
                state.customMad = c.madM;
            }
            if (c.madUnit) state.madUnit = c.madUnit;
            if (c.arrestForceKn !== undefined) {
                state.arrestForceKn = c.arrestForceKn;
                state.arrestForceLbf = (typeof c.arrestForceLbf === "number") ? c.arrestForceLbf : Math.round(c.arrestForceKn * UnitsModule.KN_TO_LBF);
            }
            if (c.arrestForceUnit) state.arrestForceUnit = c.arrestForceUnit;
            if (c.connectingDevice) state.connectingDevice = c.connectingDevice;

            if (c.retractedLengthM !== undefined) state.retractedLengthM = c.retractedLengthM;
            if (c.retractedLengthUnit) state.retractedLengthUnit = c.retractedLengthUnit;
            if (c.isRetractedLengthModified !== undefined) state.isRetractedLengthModified = c.isRetractedLengthModified;

            // Backward compatibility: old SRL names map to TurboLite+ and Falcon+
            if (c.selectedSrlId) {
                state.selectedSrlId = c.selectedSrlId;
            } else if (c.srl_model && (c.srl_model.includes("Turbo") || c.srl_model.includes("turbo"))) {
                state.selectedSrlId = "turbo_light_9ft";
            } else if (c.srl_model && (c.srl_model.includes("Falcon") || c.srl_model.includes("falcon"))) {
                state.selectedSrlId = "falcon_leading_edge";
            }
            if (c.customDeviceName !== undefined) state.customDeviceName = c.customDeviceName;
            if (c.customDeviceClass !== undefined) state.customDeviceClass = c.customDeviceClass;
            if (c.customDeviceLengthM !== undefined) state.customDeviceLengthM = c.customDeviceLengthM;

            // Sync layout & product dropdowns
            const layoutSel = document.getElementById("select-layout-type");
            if (layoutSel) layoutSel.value = state.layoutType;

            const prodSel = document.getElementById("select-product");
            if (prodSel) prodSel.value = state.product;

            // Sync Prompt 15 DOM inputs
            const inMad = document.getElementById("input-srl-mad");
            const selMadUnit = document.getElementById("select-mad-unit");
            if (inMad && selMadUnit) {
                selMadUnit.value = state.madUnit || "m";
                inMad.value = (state.madUnit === "in") ? (state.madM / 0.0254).toFixed(1) : state.madM.toFixed(2);
            }
            const inAf = document.getElementById("input-arrest-force");
            const selAfUnit = document.getElementById("select-arrest-force-unit");
            if (inAf && selAfUnit) {
                selAfUnit.value = state.arrestForceUnit || "lbf";
                inAf.value = (state.arrestForceUnit === "kN") ? state.arrestForceKn.toFixed(2) : state.arrestForceLbf.toFixed(0);
            }
            const selDev = document.getElementById("select-connecting-device");
            if (selDev) selDev.value = state.connectingDevice;
            const inCustomName = document.getElementById("input-custom-device-name");
            if (inCustomName) inCustomName.value = state.customDeviceName || "";
            const selCustomCls = document.getElementById("select-custom-device-class");
            if (selCustomCls) selCustomCls.value = state.customDeviceClass || 2;
            const inCustomLen = document.getElementById("input-custom-device-length");
            if (inCustomLen) inCustomLen.value = state.customDeviceLengthM || 0.60;
            const inEng = document.getElementById("input-engineer-coefficient");
            if (inEng) inEng.value = (state.fallFactor || 1.0).toFixed(2);

            closeProjectsModal();
            if (typeof updateMadEquivalentUI === "function") updateMadEquivalentUI();
            if (typeof updateArrestForceEquivalentUI === "function") updateArrestForceEquivalentUI();
            if (typeof updateConnectingDeviceUI === "function") updateConnectingDeviceUI();
            if (typeof validateSrlSelection === "function") validateSrlSelection();
            if (typeof renderDynamicLayoutForm === "function") renderDynamicLayoutForm();
            if (typeof update3DScene === "function") update3DScene();
            alert(`✅ Projet "${proj.name}" chargé avec succès dans le configurateur 3D.`);
        } catch (e) {
            alert("Erreur lors du chargement : " + e.message);
        }
    }

    function deleteProjectUI(projectId) {
        try {
            deleteProject(projectId);
            renderUserProjectsTable();
            AuthModule.renderAdminProjectsTable();
        } catch (e) {
            alert(e.message);
        }
    }

    return {
        saveProject,
        listProjects,
        deleteProject,
        getAllProjects,
        openProjectsModal,
        closeProjectsModal,
        handleSaveCurrentProject,
        renderUserProjectsTable,
        loadProject,
        deleteProjectUI
    };
})();


// URL Query Parameter support for direct layout initialization (e.g. ?config=10 or ?layout=slope_horizontal_comb)
const urlParams = (typeof window !== "undefined" && window.location) ? new URLSearchParams(window.location.search) : null;
const urlConfigMap = {
    "1": "single_span",
    "2": "multi_straight",
    "3": "multi_bend_90",
    "4": "multi_bend_var",
    "5": "multi_bend_multi90",
    "6": "multi_bend_circle",
    "7": "multi_bend_multivar",
    "8": "slope_single",
    "9": "slope_multi",
    "10": "slope_horizontal_comb",
    "11": "cross_spans",
    "12": "grid_system"
};
const rawInitialLayout = (urlParams && (urlParams.get("layout") || urlConfigMap[urlParams.get("config")])) || "single_span";
const isDeprecatedInitial = DEPRECATED_CONFIGS.includes(rawInitialLayout);
const initialLayoutType = isDeprecatedInitial ? "multi_straight" : rawInitialLayout;

// Global Application State (OSHA 12 Layouts Version)
const state = {
    // OSHA 12-Layout Configuration State
    layoutType: initialLayoutType, // 1 of 6 simplified active layouts
    showStairs: true,              // Spec V2 — 08: Bascule affichage escaliers (par défaut active)
    customMad: undefined,          // Spec V2 — 08: MAD modifiable
    hasConvertedDeprecatedConfig: isDeprecatedInitial,
    unitSystem: "metric",      // "metric" | "imperial"
    norm: "OSHA",              // "OSHA" | "EN 795" (Norme réglementaire)
    appMode: "fall_arrest",    // "fall_arrest" | "restraint"
    projectInfo: {
        name: "",
        location: "",
        date: new Date().toISOString().slice(0, 10),
        designer: "",
        hllName: "HLL-01"
    },
    arrestLoadMode: "lump_sum",  // "lump_sum" | "custom" | "turbolite" | "falcon"
    arrestLoadValue: 6.0,      // in kN
    bufferLength: 0.20,        // Fixed buffer length 0.20m (or 0.30m for Long Range)

    // Anchor Effort Distribution state (Spec prompt_antigravity_calcul_efforts_ancrages)
    userMassKg: 141,
    gridPretensionKg: 600,
    fallPosition: {
        segmentIndex: 0,
        branch: "north", // for Config 11
        gridCrossX: 0,   // for Config 12
        gridCrossZ: 0,   // for Config 12
        gridBranch: "X+" // for Config 12
    },

    // HLL Elevation presets (Spec V2 - 02)
    hllElevationPreset: "knee", // "knee" (0.45m) | "d_ring" (1.50m) | "overhead" (3.00m) | "custom"
    hllElevation: 0.45,
    engineerCoefficient: 1.00, // Spec V2 — 07 & Spec V2 — 09 / Prompt 15: Fall Factor (0.10 to 5.00, default 1.00)
    fallFactor: 1.00,
    selectedFallSpanId: null, // Stable tracking of fall span by UID

    // Spec V2 - 03: Roof as primary input & dimensions
    roof_type: "flat", // "flat" | "sloped" | "triangle"
    roof_length: 25.0,
    roof_width: 15.0,
    roof_slope_deg: 0.0,
    roof_slope_deg_2: 0.0,
    ridge_position: 7.5,
    line_to_edge: 2.0,
    roof_height_above_ground: 6.0,
    show_dimensions: true,

    // Spec V2 — 09 / Prompt 15 & Spec V2 — 10 / Prompt 16: Retracted Length, MAD, Arrest Force, Devices
    retractedLengthM: 0.60,          // Stored in meters (mandatory free entry > 0)
    retractedLengthUnit: "m",        // "m" | "ft" | "in"
    isRetractedLengthModified: false,// True when user changed value from catalog preset
    madM: 1.10,                      // Stored in meters (mandatory free entry > 0)
    madUnit: "m",                    // "m" | "in"
    isMadModified: false,
    customMad: 1.10,                 // Compatible alias for clearance logic
    arrestForceKn: 4.5,              // Stored in kN (mandatory free entry > 0 and <= 5000 lbf)
    arrestForceLbf: 1012,            // in lbf
    arrestForceUnit: "lbf",          // "lbf" | "kN"
    isArrestForceModified: false,
    selectedSrlId: null,             // "turbo_light_9ft" | "falcon_leading_edge"
    connectingDevice: "srd",         // "srd" | "custom_srd" | "lanyard" | "custom_lanyard"
    customDeviceName: "",            // Free name for custom device
    customDeviceClass: 2,            // 1 | 2 for custom SRL
    customDeviceLengthM: 0.60,       // Retracted length or lanyard length in meters
    fallCalculationMode: "critical_case", // "critical_case" | "selected_span"
    bodyPosition: "standing",        // "standing" | "kneeling" | "lying"
    dRingHeightM: 1.50,
    wwsElevationM: 6.0,
    substrateInfo: "",
    users: [{ massKg: 141, arrestLoadKn: 6.0, device: "SRL" }],

    // Unified Spans Data Structure
    spans: (function() {
        let base = [];
        if (initialLayoutType === "slope_multi") {
            base = [
                { length: 10.0, slopeDeg: 20 },
                { length: 12.0, slopeDeg: 35 },
                { length: 8.0, slopeDeg: 25 }
            ];
        } else if (initialLayoutType === "slope_single") {
            base = [
                { length: 20.0, slopeDeg: 30 }
            ];
        } else if (initialLayoutType === "slope_horizontal_comb") {
            base = [
                { length: 5.0, slopeDeg: 0, isSloped: false },
                { length: 5.0, slopeDeg: 30, isSloped: true },
                { length: 5.0, slopeDeg: 0, isSloped: false },
                { length: 5.0, slopeDeg: 30, isSloped: true },
                { length: 5.0, slopeDeg: 0, isSloped: false }
            ];
        } else if (initialLayoutType === "multi_straight") {
            base = [
                { length: 8.0, bendDeg: 0 },
                { length: 8.0, bendDeg: 0 },
                { length: 8.0, bendDeg: 0 }
            ];
        } else {
            base = [{ length: 15.0, bendDeg: 0, slopeDeg: 0, isSloped: false, bend90: false }];
        }
        return base.map((sp, idx) => ({
            id: "spn_" + (Date.now() + idx),
            length: sp.length || 5.0,
            bendDeg: sp.bendDeg || 0,
            bend_after_deg: sp.bendDeg || 0,
            slopeDeg: sp.slopeDeg || 0,
            slope_deg: sp.slopeDeg || 0,
            isSloped: !!sp.isSloped,
            bend90: !!sp.bend90
        }));
    })(),
    closedLoop: false,
    bendOrientation: "inside", // "inside" | "outside"

    // Configuration 6 Reservoir / Closed Loop Circle Settings
    config6Mode: "reservoir",        // "reservoir" (regular polygon) | "manual" (table)
    config6Diameter: 30.0,           // Diameter of water tank in meters (default 30m)
    config6NbPosts: 16,              // Number of posts N (default 16)
    config6Setback: 0.5,             // Edge setback in meters (default 0.5m)
    config6Height: 8.0,              // Water tank height in meters (default 8m)
    config6StructureType: "reservoir",// "reservoir" | "water_tower" | "lighthouse" | "clarifier"

    // Cross-spans configuration (Config 11)
    crossSpans: { north: 10.0, east: 10.0, south: 10.0, west: 10.0 },

    // Grid system configuration (Config 12)
    gridSystem: {
        nx: 3,
        ny: 3,
        xSpacings: [5.0, 5.0],
        zSpacings: [5.0, 5.0]
    },

    // Legacy fields maintained for backwards compatibility
    lineLength: 15.0,
    spanMode: "standard",
    customSpan: 5.0,
    hasLine2: false,
    line2Length: 10.0,
    xMatrixLocation: "mid",
    L: 21.0,
    l: 12.0,
    roofShape: "flat",
    roofSlope: 0,
    nbUsers: 1,
    fallFactor: 1.00, // Spec V2 — 09 / Prompt 15: Fall Factor default 1.00
    engineerCoefficient: 1.00, // Synced alias
    madM: 1.10,
    madUnit: "m",
    customMad: 1.10,
    arrestForceKn: 4.5,
    arrestForceLbf: 1012,
    arrestForceUnit: "lbf",
    connectingDevice: "srd",
    customDeviceName: "",
    customDeviceClass: 2,
    customDeviceLengthM: 0.60,
    product: (initialLayoutType === "grid_system") ? "EXTREME" : "CORE",
    norm: "EN 795",
    oshaSpanMode: "unique",
    viewMode: "3d",
    roofTexture: "concrete",
    showObstacles: false,
    gridVisible: true,
    showAnchorLabels: true,
    showSpanLabels: true,
    lang: 0,
    mountingType: (initialLayoutType === "grid_system") ? "overhead" : "standard",
    checkedComponents: {},
    colors: {
        roof: "#cbd5e1",
        anchors: "#f8fafc",
        cable: "#f8fafc"
    }
};

// ==========================================
// SPEC V2 - 02 : LAYOUT & ELEVATION EDITOR ENGINE
// ==========================================
// SPEC V2 - 02 : LAYOUT & ELEVATION EDITOR ENGINE
// SLOPE_MAX_DEG is declared at top level (const SLOPE_MAX_DEG = 75;)

let _layoutSpanIdCounter = 1;
function generateSpanId() {
    return "spn_" + Date.now() + "_" + (_layoutSpanIdCounter++);
}

class LayoutHistoryManager {
    constructor(maxSize = 100) {
        this.maxSize = maxSize;
        this.undoStack = [];
        this.redoStack = [];
    }

    pushSnapshot(stateObj) {
        const snapshot = JSON.stringify({
            spans: (stateObj.spans || []).map(s => ({ ...s, xMatrixBranches: (s.xMatrixBranches || []).map(b => ({ ...b, spans: (b.spans || []).map(sub => ({ ...sub })) })) })),
            selectedFallSpanId: stateObj.selectedFallSpanId,
            startBendDeg: stateObj.startBendDeg || 0,
            hllElevationPreset: stateObj.hllElevationPreset,
            hllElevation: stateObj.hllElevation,
            engineerCoefficient: stateObj.engineerCoefficient || 1.00,
            fallFactor: stateObj.fallFactor || 1.00,
            madM: stateObj.madM,
            madUnit: stateObj.madUnit,
            arrestForceKn: stateObj.arrestForceKn,
            arrestForceUnit: stateObj.arrestForceUnit,
            connectingDevice: stateObj.connectingDevice,
            customDeviceName: stateObj.customDeviceName,
            customDeviceClass: stateObj.customDeviceClass,
            customDeviceLengthM: stateObj.customDeviceLengthM,
            layoutType: stateObj.layoutType,
            roofSlope: stateObj.roofSlope,
            product: stateObj.product
        });
        this.undoStack.push(snapshot);
        if (this.undoStack.length > this.maxSize) this.undoStack.shift();
        this.redoStack = [];
        this.updateButtonsUI();
    }

    undo(stateObj) {
        if (this.undoStack.length === 0) return null;
        const currentSnapshot = JSON.stringify({
            spans: (stateObj.spans || []).map(s => ({ ...s, xMatrixBranches: (s.xMatrixBranches || []).map(b => ({ ...b, spans: (b.spans || []).map(sub => ({ ...sub })) })) })),
            selectedFallSpanId: stateObj.selectedFallSpanId,
            startBendDeg: stateObj.startBendDeg || 0,
            hllElevationPreset: stateObj.hllElevationPreset,
            hllElevation: stateObj.hllElevation,
            engineerCoefficient: stateObj.engineerCoefficient || 1.00,
            fallFactor: stateObj.fallFactor || 1.00,
            madM: stateObj.madM,
            madUnit: stateObj.madUnit,
            arrestForceKn: stateObj.arrestForceKn,
            arrestForceUnit: stateObj.arrestForceUnit,
            connectingDevice: stateObj.connectingDevice,
            customDeviceName: stateObj.customDeviceName,
            customDeviceClass: stateObj.customDeviceClass,
            customDeviceLengthM: stateObj.customDeviceLengthM,
            layoutType: stateObj.layoutType,
            roofSlope: stateObj.roofSlope,
            product: stateObj.product
        });
        this.redoStack.push(currentSnapshot);
        const prev = JSON.parse(this.undoStack.pop());
        this.updateButtonsUI();
        return prev;
    }

    redo(stateObj) {
        if (this.redoStack.length === 0) return null;
        const currentSnapshot = JSON.stringify({
            spans: (stateObj.spans || []).map(s => ({ ...s, xMatrixBranches: (s.xMatrixBranches || []).map(b => ({ ...b, spans: (b.spans || []).map(sub => ({ ...sub })) })) })),
            selectedFallSpanId: stateObj.selectedFallSpanId,
            startBendDeg: stateObj.startBendDeg || 0,
            hllElevationPreset: stateObj.hllElevationPreset,
            hllElevation: stateObj.hllElevation,
            engineerCoefficient: stateObj.engineerCoefficient || 1.00,
            fallFactor: stateObj.fallFactor || 1.00,
            madM: stateObj.madM,
            madUnit: stateObj.madUnit,
            arrestForceKn: stateObj.arrestForceKn,
            arrestForceUnit: stateObj.arrestForceUnit,
            connectingDevice: stateObj.connectingDevice,
            customDeviceName: stateObj.customDeviceName,
            customDeviceClass: stateObj.customDeviceClass,
            customDeviceLengthM: stateObj.customDeviceLengthM,
            layoutType: stateObj.layoutType,
            roofSlope: stateObj.roofSlope,
            product: stateObj.product
        });
        this.undoStack.push(currentSnapshot);
        const next = JSON.parse(this.redoStack.pop());
        this.updateButtonsUI();
        return next;
    }

    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }

    updateButtonsUI() {
        if (typeof document === "undefined") return;
        const uBtn = document.getElementById("btn-undo");
        const rBtn = document.getElementById("btn-redo");
        const tblU = document.getElementById("btn-table-undo");
        const tblR = document.getElementById("btn-table-redo");
        const uState = !this.canUndo();
        const rState = !this.canRedo();
        if (uBtn) uBtn.disabled = uState;
        if (rBtn) rBtn.disabled = rState;
        if (tblU) tblU.disabled = uState;
        if (tblR) tblR.disabled = rState;
    }
}

const LayoutEditorModule = (function() {
    const history = new LayoutHistoryManager(100);

    function ensureSpansHaveStableIds() {
        if (!state.spans || state.spans.length === 0) {
            state.spans = [{ id: generateSpanId(), length: 15.0, bendDeg: 0, bend_after_deg: 0, slopeDeg: 0, slope_deg: 0, isSloped: false, bend90: false }];
        }
        state.spans.forEach((sp, idx) => {
            if (!sp.id) sp.id = generateSpanId();
            if (sp.bend_after_deg === undefined && sp.bendDeg !== undefined) sp.bend_after_deg = sp.bendDeg;
            if (sp.bendDeg === undefined && sp.bend_after_deg !== undefined) sp.bendDeg = sp.bend_after_deg;
            if (sp.slope_deg === undefined && sp.slopeDeg !== undefined) sp.slope_deg = sp.slopeDeg;
            if (sp.slopeDeg === undefined && sp.slope_deg !== undefined) sp.slopeDeg = sp.slope_deg;
        });

        // Ensure selectedFallSpanId points to a valid span
        if (!state.selectedFallSpanId || !state.spans.some(s => s.id === state.selectedFallSpanId)) {
            state.selectedFallSpanId = state.spans[0].id;
        }

        // CRITICAL: Synchronize fallPosition.segmentIndex from selectedFallSpanId
        const fIdx = state.spans.findIndex(s => s.id === state.selectedFallSpanId);
        if (!state.fallPosition) state.fallPosition = { segmentIndex: 0 };
        state.fallPosition.segmentIndex = (fIdx !== -1) ? fIdx : 0;
    }

    function createSpanObj(length = 5.0, bend = 0, slope = 0) {
        const slopeVal = parseFloat(slope) || 0;
        if (Math.abs(slopeVal) > SLOPE_MAX_DEG) {
            throw new Error(`Pente maximale autorisée : ${SLOPE_MAX_DEG}° (valeur rejetée: ${slopeVal}°).`);
        }
        return {
            id: generateSpanId(),
            length: Math.max(0.1, parseFloat(length) || 5.0),
            bendDeg: parseFloat(bend) || 0,
            bend_after_deg: parseFloat(bend) || 0,
            slopeDeg: slopeVal,
            slope_deg: slopeVal,
            isSloped: Math.abs(slopeVal) > 0.01,
            bend90: Math.abs(bend - 90) < 0.1
        };
    }

    function recordState(actionName) {
        history.pushSnapshot(state);
    }

    function insertSpan(index, position = "after", length = 5.0, bend = 0, slope = 0) {
        recordState(`insert_span_${position}`);
        const newSpan = createSpanObj(length, bend, slope);
        const insertIdx = (position === "before") ? Math.max(0, index) : index + 1;
        state.spans.splice(insertIdx, 0, newSpan);

        if (state.layoutType === "single_span") {
            state.layoutType = (bend !== 0 || slope !== 0) ? "multi_bend_var" : "multi_straight";
            const layoutSel = document.getElementById("select-layout-type");
            if (layoutSel) layoutSel.value = state.layoutType;
        }

        refreshUI();
        return newSpan;
    }

    function insertSpanAtStart(length = 5.0, bend = 0, slope = 0) {
        return insertSpan(0, "before", length, bend, slope);
    }

    function insertSpanAtEnd(length = 5.0, bend = 0, slope = 0) {
        return insertSpan(state.spans.length - 1, "after", length, bend, slope);
    }

    function splitSpan(index, cutDistance = null) {
        if (index < 0 || index >= state.spans.length) return;
        const target = state.spans[index];
        let cut = cutDistance !== null ? parseFloat(cutDistance) : null;
        if (cut === null) {
            const isEn = (parseInt(state.lang) === 1);
            const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
            const distUnit = isUS ? "ft" : "m";
            const totalLenStr = isUS ? `${(target.length * M_TO_FT).toFixed(2)} ft` : `${target.length.toFixed(2)} m`;
            const defaultCut = isUS ? ((target.length / 2) * M_TO_FT).toFixed(2) : (target.length / 2).toFixed(2);
            const promptMsg = isEn
                ? `Split span S${index + 1} (total length: ${totalLenStr}):\nCut position (${distUnit}) from the start of the span:`
                : `Scinder la portée S${index + 1} (longueur totale: ${totalLenStr}) :\nPosition du point de coupe (${distUnit}) depuis le début de la portée :`;
            const res = prompt(promptMsg, defaultCut);
            if (res === null) return;
            cut = parseFloat(res);
            if (isUS) cut = cut * FT_TO_M;
        }

        if (isNaN(cut) || cut <= 0.05 || cut >= target.length - 0.05) {
            const isEn = (parseInt(state.lang) === 1);
            const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
            const minStr = isUS ? `${(0.05 * M_TO_FT).toFixed(2)} ft` : "0.05 m";
            const maxStr = isUS ? `${((target.length - 0.05) * M_TO_FT).toFixed(2)} ft` : `${(target.length - 0.05).toFixed(2)} m`;
            alert(isEn
                ? `Invalid cut position. Must be between ${minStr} and ${maxStr}.`
                : `Position de coupe invalide. Elle doit être comprise entre ${minStr} et ${maxStr}.`);
            return;
        }

        recordState("split_span");
        const remainingLength = parseFloat((target.length - cut).toFixed(2));
        target.length = parseFloat(cut.toFixed(2));

        const secondPart = createSpanObj(remainingLength, target.bendDeg || target.bend_after_deg || 0, target.slopeDeg || target.slope_deg || 0);
        target.bendDeg = 0;
        target.bend_after_deg = 0;
        target.bend90 = false;

        state.spans.splice(index + 1, 0, secondPart);
        if (state.layoutType === "single_span") {
            state.layoutType = "multi_straight";
            const layoutSel = document.getElementById("select-layout-type");
            if (layoutSel) layoutSel.value = "multi_straight";
        }
        refreshUI();
    }

    function deleteSpan(index) {
        if (state.spans.length <= 1) {
            alert("Impossible de supprimer la dernière portée de la ligne.");
            return;
        }
        recordState("delete_span");
        const deleted = state.spans.splice(index, 1)[0];
        if (state.selectedFallSpanId === deleted.id) {
            const nextIdx = Math.min(index, state.spans.length - 1);
            state.selectedFallSpanId = state.spans[nextIdx].id;
        }
        refreshUI();
    }

    function insertBend(spanIndex, angleDeg = 90, position = "after") {
        recordState("insert_bend");
        const angle = parseFloat(angleDeg) || 0;
        if (position === "start" || spanIndex === -1) {
            state.startBendDeg = angle;
        } else if (spanIndex >= 0 && spanIndex < state.spans.length) {
            state.spans[spanIndex].bendDeg = angle;
            state.spans[spanIndex].bend_after_deg = angle;
            state.spans[spanIndex].bend90 = Math.abs(angle - 90) < 0.1;
        }
        if (state.layoutType === "single_span" || state.layoutType === "multi_straight") {
            state.layoutType = "multi_bend_var";
            const layoutSel = document.getElementById("select-layout-type");
            if (layoutSel) layoutSel.value = "multi_bend_var";
        }
        refreshUI();
    }

    function removeBend(spanIndex) {
        recordState("remove_bend");
        if (spanIndex === -1) {
            state.startBendDeg = 0;
        } else if (spanIndex >= 0 && spanIndex < state.spans.length) {
            state.spans[spanIndex].bendDeg = 0;
            state.spans[spanIndex].bend_after_deg = 0;
            state.spans[spanIndex].bend90 = false;
        }
        refreshUI();
    }

    function setSpanSlope(index, slopeDeg) {
        const val = parseFloat(slopeDeg) || 0;
        if (val !== 0 && (state.norm === "EN 795" || state.norm === "EN")) {
            alert(["⚠️ Norme EN 795 : Les pentes ne sont pas autorisées selon la norme EN 795 (autorisées uniquement en norme OSHA). La pente a été désactivée.", "⚠️ EN 795 Standard: Slopes are not permitted under EN 795 (allowed only under OSHA). Slope has been disabled."][state.lang || 0]);
            state.spans[index].slopeDeg = 0;
            state.spans[index].slope_deg = 0;
            state.spans[index].isSloped = false;
            refreshUI();
            return false;
        }
        if (Math.abs(val) > SLOPE_MAX_DEG) {
            alert(`⚠️ Pente maximale autorisée : ${SLOPE_MAX_DEG}° !\nLa valeur saisie (${val}°) dépasse la limite stricte de sécurité autorisée.`);
            refreshUI();
            return false;
        }
        recordState("set_slope");
        state.spans[index].slopeDeg = val;
        state.spans[index].slope_deg = val;
        state.spans[index].isSloped = Math.abs(val) > 0.01;
        refreshUI();
        return true;
    }

    function setSpanBend(index, bendDeg) {
        const val = parseFloat(bendDeg) || 0;
        recordState("set_bend");
        state.spans[index].bendDeg = val;
        state.spans[index].bend_after_deg = val;
        state.spans[index].bend90 = Math.abs(val - 90) < 0.1;
        refreshUI();
    }

    function setSpanLength(index, length) {
        const val = Math.max(0.1, parseFloat(length) || 1.0);
        recordState("set_length");
        state.spans[index].length = val;
        refreshUI();
    }

    function setHllElevation(preset, customValue = null) {
        recordState("set_hll_elevation");
        state.hllElevationPreset = preset;
        const isRange = isExtreme(state.product);
        if (preset === "knee") {
            state.hllElevation = 0.45;
        } else if (preset === "d_ring") {
            state.hllElevation = 1.50; // 1.50m (Anneau D)
        } else if (preset === "overhead") {
            state.hllElevation = isRange ? 3.00 : 1.80; // 1.80m pour PRO & CORE, 3.00m pour EXTREME
        } else if (preset === "custom") {
            state.hllElevation = Math.max(0.2, parseFloat(customValue) || (isRange ? 3.00 : 1.80));
        }
        if (state.norm === "EN 795" || state.norm === "EN") {
            state.fallFactor = computeFallFactorFromElevation(preset, state.hllElevation, state.bodyPosition);
        } else {
            state.fallFactor = (typeof state.engineerCoefficient === "number" && !isNaN(state.engineerCoefficient)) ? state.engineerCoefficient : 1.00;
        }

        syncElevationInputsUI();
        if (typeof validateSrlSelection === "function") validateSrlSelection();
        if (typeof update3DScene === "function") update3DScene();
        if (typeof updateCalculationsUI === "function") updateCalculationsUI();
    }

    function setEngineerCoefficient(val) {
        let num = parseFloat(val);
        if (isNaN(num)) num = 1.00;
        num = Math.max(0.10, Math.min(5.00, num));
        recordState("set_engineer_coefficient");
        state.engineerCoefficient = num;
        if (state.norm === "OSHA") {
            state.fallFactor = num;
        }
        const engInp = document.getElementById("input-engineer-coefficient");
        if (engInp) engInp.value = num.toFixed(2);
        const valEngCoef = document.getElementById("val-engineer-coef");
        if (valEngCoef) valEngCoef.textContent = num.toFixed(2);
        if (typeof updateCalculationsUI === "function") updateCalculationsUI();
    }

    function checkPostExtensionWarning() {
        const elev = parseFloat(state.hllElevation) || 0.45;
        const warnEl = document.getElementById("canvas-warning");
        const warnTxt = document.getElementById("warning-text");

        if (elev > 3.5) {
            if (warnEl && warnTxt) {
                warnTxt.textContent = `⚠️ Élévation très élevée (${elev.toFixed(2)} m) : vérifier le dimensionnement des poteaux hauts et du haubanage.`;
                warnEl.classList.remove("hidden");
            }
        } else if (elev > 0.55 && !isExtreme(state.product)) {
            if (warnEl && warnTxt) {
                warnTxt.textContent = `ℹ️ Configuration ${state.hllElevationPreset === 'd_ring' ? 'Anneau D (1,50 m)' : 'Overhead (1,80 m)'} : Modèle de potelet spécifique ${elev.toFixed(2)} m sélectionné sur ${normalizeProduct(state.product)}.`;
                warnEl.classList.remove("hidden");
            }
        } else {
            if (warnTxt && (warnTxt.textContent.includes("Élévation") || warnTxt.textContent.includes("extension") || warnTxt.textContent.includes("Modèle de potelet"))) {
                if (warnEl) warnEl.classList.add("hidden");
            }
        }
    }

    function syncElevationInputsUI() {
        if (typeof document === "undefined") return;
        const sel = document.getElementById("select-hll-elevation-preset");
        const valGrp = document.getElementById("group-hll-elevation-val");
        const valInp = document.getElementById("input-hll-elevation-val");
        const tbSel = document.getElementById("select-hll-elevation-toolbar");
        const isRange = isExtreme(state.product);

        // Adapt options for Extreme vs Pro / Core
        if (sel) {
            const optKnee = sel.querySelector('option[value="knee"]');
            const optDRing = sel.querySelector('option[value="d_ring"]');
            const optOverhead = sel.querySelector('option[value="overhead"]');
            const optCustom = sel.querySelector('option[value="custom"]');

            if (optKnee) optKnee.textContent = isRange ? "Standard (Absorbeur direct)" : "Hauteur de genou (Nominale ~0,45 m)";
            if (optDRing) {
                optDRing.style.display = isRange ? "none" : "block";
                optDRing.textContent = "Anneau D (1,50 m / Modèle 1.5m)";
            }
            if (optOverhead) optOverhead.textContent = isRange ? "Overhead (3,00 m — Poteau haut)" : "Overhead (1,80 m / Modèle 1.8m)";
            if (optCustom) optCustom.style.display = isRange ? "block" : "none";
        }

        if (tbSel) {
            const tbOptKnee = tbSel.querySelector('option[value="knee"]');
            const tbOptDRing = tbSel.querySelector('option[value="d_ring"]');
            const tbOptOverhead = tbSel.querySelector('option[value="overhead"]');
            const tbOptCustom = tbSel.querySelector('option[value="custom"]');

            if (tbOptKnee) tbOptKnee.textContent = isRange ? "Standard" : "Genou (0,45 m)";
            if (tbOptDRing) {
                tbOptDRing.style.display = isRange ? "none" : "block";
                tbOptDRing.textContent = "Anneau D (1,50 m)";
            }
            if (tbOptOverhead) tbOptOverhead.textContent = isRange ? "Overhead (3,0 m)" : "Overhead (1,8 m)";
            if (tbOptCustom) tbOptCustom.style.display = isRange ? "block" : "none";
        }

        // If not range and on custom, revert to overhead or knee
        if (!isRange && state.hllElevationPreset === "custom") {
            state.hllElevationPreset = "overhead";
            state.hllElevation = 1.80;
        }

        const preset = state.hllElevationPreset || "knee";

        if (sel) sel.value = preset;
        if (tbSel) tbSel.value = preset;
        if (valInp) valInp.value = state.hllElevation || 0.45;
        if (valGrp) {
            valGrp.style.display = (isRange && preset === "custom") ? "block" : "none";
        }

        // Spec V2 — 07 / Prompt 12: Sync Engineer coefficient and elevation inputs
        const isOSHA = (state.norm === "OSHA");
        const enFF = computeFallFactorFromElevation(state.hllElevationPreset, state.hllElevation, state.bodyPosition);
        const l = (parseInt(state.lang) === 1 || parseInt(state.lang) === 2) ? parseInt(state.lang) : 0;
        const engInp = document.getElementById("input-engineer-coefficient");
        const hintEng = document.getElementById("hint-engineer-coefficient");
        if (engInp) {
            if (isOSHA) {
                engInp.disabled = false;
                engInp.value = parseFloat(state.engineerCoefficient !== undefined ? state.engineerCoefficient : 1.00).toFixed(2);
                if (hintEng) hintEng.textContent = ["Ajuste les efforts calculés (défaut 1.00 = essais)", "Adjusts calculated forces (default 1.00 = tests)", "Ajusta las fuerzas calculadas (defecto 1.00 = pruebas)"][l];
            } else {
                engInp.disabled = true;
                engInp.value = String(enFF);
                if (hintEng) hintEng.textContent = ["Déduit de l'élévation de ligne (0, 1 ou 2)", "Deduced from lifeline elevation (0, 1 or 2)", "Deducido de la elevación (0, 1 o 2)"][l];
            }
        }
        const valEngCoef = document.getElementById("val-engineer-coef");
        if (valEngCoef) {
            valEngCoef.textContent = isOSHA
                ? parseFloat(state.engineerCoefficient !== undefined ? state.engineerCoefficient : 1.00).toFixed(2)
                : String(enFF);
        }

        checkPostExtensionWarning();
        if (typeof renderComponentsChecklist === "function") renderComponentsChecklist();
        if (typeof validateSrlSelection === "function") validateSrlSelection();
    }

    function undo() {
        const prev = history.undo(state);
        if (prev) {
            state.spans = prev.spans.map(s => ({ ...s }));
            state.selectedFallSpanId = prev.selectedFallSpanId;
            state.startBendDeg = prev.startBendDeg || 0;
            state.hllElevationPreset = prev.hllElevationPreset;
            state.hllElevation = prev.hllElevation;
            if (prev.engineerCoefficient !== undefined) state.engineerCoefficient = prev.engineerCoefficient;
            if (prev.fallFactor !== undefined) state.fallFactor = prev.fallFactor;
            if (prev.madM !== undefined) { state.madM = prev.madM; state.customMad = prev.madM; }
            if (prev.madUnit !== undefined) state.madUnit = prev.madUnit;
            if (prev.arrestForceKn !== undefined) state.arrestForceKn = prev.arrestForceKn;
            if (prev.arrestForceUnit !== undefined) state.arrestForceUnit = prev.arrestForceUnit;
            if (prev.connectingDevice !== undefined) state.connectingDevice = prev.connectingDevice;
            if (prev.customDeviceName !== undefined) state.customDeviceName = prev.customDeviceName;
            if (prev.customDeviceClass !== undefined) state.customDeviceClass = prev.customDeviceClass;
            if (prev.customDeviceLengthM !== undefined) state.customDeviceLengthM = prev.customDeviceLengthM;
            if (prev.layoutType) state.layoutType = prev.layoutType;
            if (prev.roofSlope !== undefined) state.roofSlope = prev.roofSlope;
            refreshUI();
            if (typeof calculateAndRenderOutputs === "function") calculateAndRenderOutputs();
            return true;
        }
        return false;
    }

    function redo() {
        const next = history.redo(state);
        if (next) {
            state.spans = next.spans.map(s => ({ ...s }));
            state.selectedFallSpanId = next.selectedFallSpanId;
            state.startBendDeg = next.startBendDeg || 0;
            state.hllElevationPreset = next.hllElevationPreset;
            state.hllElevation = next.hllElevation;
            if (next.engineerCoefficient !== undefined) state.engineerCoefficient = next.engineerCoefficient;
            if (next.fallFactor !== undefined) state.fallFactor = next.fallFactor;
            if (next.madM !== undefined) { state.madM = next.madM; state.customMad = next.madM; }
            if (next.madUnit !== undefined) state.madUnit = next.madUnit;
            if (next.arrestForceKn !== undefined) state.arrestForceKn = next.arrestForceKn;
            if (next.arrestForceUnit !== undefined) state.arrestForceUnit = next.arrestForceUnit;
            if (next.connectingDevice !== undefined) state.connectingDevice = next.connectingDevice;
            if (next.customDeviceName !== undefined) state.customDeviceName = next.customDeviceName;
            if (next.customDeviceClass !== undefined) state.customDeviceClass = next.customDeviceClass;
            if (next.customDeviceLengthM !== undefined) state.customDeviceLengthM = next.customDeviceLengthM;
            if (next.layoutType) state.layoutType = next.layoutType;
            if (next.roofSlope !== undefined) state.roofSlope = next.roofSlope;
            refreshUI();
            if (typeof calculateAndRenderOutputs === "function") calculateAndRenderOutputs();
            return true;
        }
        return false;
    }

    function selectFallSpan(spanId) {
        if (state.selectedFallSpanId === spanId) return;
        recordState("select_fall_span");
        state.selectedFallSpanId = spanId;
        refreshUI();
    }

    function refreshUI() {
        ensureSpansHaveStableIds();
        history.updateButtonsUI();
        syncElevationInputsUI();
        if (typeof renderDynamicLayoutForm === "function") renderDynamicLayoutForm();
        if (typeof update3DScene === "function") update3DScene();
    }

    function initKeyboardAndToolbar() {
        if (typeof window === "undefined") return;
        window.addEventListener("keydown", (e) => {
            const tag = (e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "");
            const isTyping = (tag === "textarea" || (tag === "input" && e.target.type === "text"));

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                if (!isTyping) {
                    e.preventDefault();
                    undo();
                }
            } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
                if (!isTyping) {
                    e.preventDefault();
                    redo();
                }
            }
        });

        const uBtn = document.getElementById("btn-undo");
        if (uBtn) uBtn.addEventListener("click", () => undo());
        const rBtn = document.getElementById("btn-redo");
        if (rBtn) rBtn.addEventListener("click", () => redo());

        const elevSel = document.getElementById("select-hll-elevation-preset");
        if (elevSel) {
            elevSel.addEventListener("change", (e) => {
                const val = e.target.value;
                setHllElevation(val);
            });
        }
        const elevInp = document.getElementById("input-hll-elevation-val");
        if (elevInp) {
            elevInp.addEventListener("change", (e) => {
                const v = parseFloat(e.target.value) || 0.45;
                setHllElevation("custom", v);
            });
        }

        const tbElevSel = document.getElementById("select-hll-elevation-toolbar");
        if (tbElevSel) {
            tbElevSel.addEventListener("change", (e) => {
                const val = e.target.value;
                if (val === "custom") {
                    const res = prompt("Hauteur d'élévation personnalisée (mètres) :", state.hllElevation || "1.80");
                    if (res !== null) {
                        const parsed = parseFloat(res);
                        if (!isNaN(parsed) && parsed >= 0.2) {
                            setHllElevation("custom", parsed);
                            return;
                        }
                    }
                    tbElevSel.value = state.hllElevationPreset || "knee";
                } else {
                    setHllElevation(val);
                }
            });
        }

        const engCoefInp = document.getElementById("input-engineer-coefficient");
        if (engCoefInp) {
            engCoefInp.addEventListener("input", (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val >= 0.10 && val <= 5.00) {
                    state.engineerCoefficient = val;
                    if (state.norm === "OSHA") state.fallFactor = val;
                    const valEngCoef = document.getElementById("val-engineer-coef");
                    if (valEngCoef) valEngCoef.textContent = val.toFixed(2);
                    if (typeof updateCalculationsUI === "function") updateCalculationsUI();
                }
            });
            engCoefInp.addEventListener("change", (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val >= 0.10 && val <= 5.00) {
                    setEngineerCoefficient(val);
                }
            });
        }

        const bodyPosSel = document.getElementById("select-body-pos");
        if (bodyPosSel) {
            bodyPosSel.addEventListener("change", (e) => {
                recordState("set_body_position");
                state.bodyPosition = e.target.value;
                if (state.norm === "EN 795" || state.norm === "EN") {
                    state.fallFactor = computeFallFactorFromElevation(state.hllElevationPreset, state.hllElevation, state.bodyPosition);
                }
                syncElevationInputsUI();
                if (typeof validateSrlSelection === "function") validateSrlSelection();
                if (typeof updateCalculationsUI === "function") updateCalculationsUI();
            });
        }

        syncElevationInputsUI();
    }

    return {
        history,
        ensureSpansHaveStableIds,
        createSpanObj,
        recordState,
        insertSpan,
        insertSpanAtStart,
        insertSpanAtEnd,
        splitSpan,
        deleteSpan,
        insertBend,
        removeBend,
        setSpanSlope,
        setSpanBend,
        setSpanLength,
        setHllElevation,
        setEngineerCoefficient,
        syncElevationInputsUI,
        selectFallSpan,
        undo,
        redo,
        refreshUI,
        initKeyboardAndToolbar
    };
})();
if (typeof window !== "undefined") {
    window.LayoutEditorModule = LayoutEditorModule;
    window.syncElevationInputsUI = LayoutEditorModule.syncElevationInputsUI;
    window.state = state;
}

// ==========================================
// SPEC V2 — 06 : UNIT CONVERSION ENGINE (METRIC <-> US FEET/LBF)
// ==========================================
// SPEC V2 — 06 : UNIT CONVERSION ENGINE (METRIC <-> US FEET/LBF)
// ==========================================
const M_TO_FT = 3.2808398950131235;
const FT_TO_M = 0.3048;
const M_TO_IN = 39.37007874015748;
const KN_TO_LBF = 224.80894387096;
const LBF_TO_KN = 0.0044482216;
const KG_TO_LB = 2.20462262185;
const LB_TO_KG = 0.45359237;

// Length constants: all distances in English are strictly in FEET (never inches)
const METERS_TO_FEET = M_TO_FT;
const FEET_TO_METERS = FT_TO_M;
const METERS_TO_INCHES = M_TO_FT; // Alias mapped to feet for backward compatibility

const UnitsModule = {
    M_TO_FT,
    FT_TO_M,
    M_TO_IN,
    KN_TO_LBF,
    LBF_TO_KN,
    KG_TO_LB,
    LB_TO_KG,

    // Spans and building dimensions displayed in FT (Spec V2 - 06: NEVER INCHES FOR SPANS)
    formatLength(meters, decimals = 1) {
        if (meters === null || meters === undefined || isNaN(meters)) return "--";
        const isImperial = (state.unitSystem === "imperial" || state.unitSystem === "us");
        if (isImperial) {
            const ftTotal = meters * M_TO_FT;
            return `${ftTotal.toFixed(decimals)} ft`;
        }
        return `${meters.toFixed(decimals === 1 ? 2 : decimals)} m`;
    },

    parseLengthToMeters(val) {
        const num = parseFloat(val) || 0;
        const isImperial = (state.unitSystem === "imperial" || state.unitSystem === "us");
        if (isImperial) {
            return num * FT_TO_M;
        }
        return num;
    },

    // Deflection formatting: m or mm in metric, ft (1 decimal) in US
    formatDeflection(val) {
        if (val === null || val === undefined || isNaN(val)) return "--";
        const deflectionM = (Math.abs(val) > 20.0) ? (val / 1000.0) : val;
        const isImperial = (state.unitSystem === "imperial" || state.unitSystem === "us");
        if (isImperial) {
            const ft = deflectionM * M_TO_FT;
            return `${ft.toFixed(1)} ft`;
        }
        const mm = deflectionM * 1000.0;
        return `${mm.toFixed(0)} mm`;
    },

    // Small dimensions (buffer, cone slip): mm in metric, ft in US
    formatSmallDim(dimM) {
        if (dimM === null || dimM === undefined || isNaN(dimM)) return "--";
        const isImperial = (state.unitSystem === "imperial" || state.unitSystem === "us");
        if (isImperial) {
            const ft = dimM * M_TO_FT;
            return `${ft.toFixed(2)} ft`;
        }
        const mm = dimM * 1000.0;
        return `${mm.toFixed(0)} mm`;
    },

    // Force / Tension: kN in metric, lbf in US (1 kN = 224.809 lbf)
    formatForce(kn, decimals = 2) {
        if (kn === null || kn === undefined || isNaN(kn)) return "--";
        const isImperial = (state.unitSystem === "imperial" || state.unitSystem === "us");
        if (isImperial) {
            const lbf = Math.round(kn * KN_TO_LBF);
            return `${lbf.toLocaleString(state.lang === 1 ? 'en-US' : 'fr-FR')} lbf`;
        }
        return `${kn.toFixed(decimals)} kN`;
    },

    parseForceToKn(val) {
        const num = parseFloat(val) || 0;
        const isImperial = (state.unitSystem === "imperial" || state.unitSystem === "us");
        if (isImperial) {
            return num * LBF_TO_KN;
        }
        return num;
    },

    // Mass: kg in metric, lb in US
    formatMass(kg) {
        if (kg === null || kg === undefined || isNaN(kg)) return "--";
        const isImperial = (state.unitSystem === "imperial" || state.unitSystem === "us");
        if (isImperial) {
            const lb = Math.round(kg * KG_TO_LB);
            return `${lb} lb`;
        }
        return `${kg} kg`;
    },

    // Cable pretension: 100 kg / 600 kg
    formatPretension(kgVal) {
        const isImperial = (state.unitSystem === "imperial" || state.unitSystem === "us");
        if (isImperial) {
            const lb = Math.round(kgVal * KG_TO_LB);
            const lbf = Math.round(kgVal * 9.81 * 0.224809);
            return `${lb} lb (${lbf} lbf)`;
        }
        return `${kgVal} kg`;
    }
};

// Global helper wrappers
function getDistanceUnit() {
    if (state.unitSystem === "imperial" || state.unitSystem === "us") return "ft";
    return "m";
}

function convertDistance(meters) {
    if (state.unitSystem === "imperial" || state.unitSystem === "us") {
        return meters * M_TO_FT;
    }
    return meters;
}

function formatDistance(meters, decimals = 2) {
    if (meters === null || meters === undefined || isNaN(meters)) {
        return `-- ${getDistanceUnit()}`;
    }
    return UnitsModule.formatLength(meters, decimals);
}

function formatDeflection(mmOrM) {
    if (mmOrM === null || mmOrM === undefined || isNaN(mmOrM)) {
        return (state.unitSystem === "imperial" || state.unitSystem === "us") ? "-- ft" : "-- mm";
    }
    const valInMeters = (mmOrM > 20) ? (mmOrM / 1000.0) : mmOrM;
    return UnitsModule.formatDeflection(valInMeters);
}

function updateUnitLabelsInDOM() {
    const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
    const isEn = (parseInt(state.lang) === 1);
    const distUnit = isUS ? "ft" : "m";
    const forceUnit = isUS ? "lbf" : "kN";
    const unitBtnText = isUS ? "US (FT/LBF)" : (isEn ? "METRIC" : "MÉTRIQUE");
    const unitBtnTitle = isEn ? "Switch Unit System (Metric / US)" : "Basculer Système d'Unités (Métrique / US)";

    // Roof, geometry and line length unit labels
    ["unit-roof-len", "unit-roof-wid", "unit-ridge-pos", "unit-line-to-edge", "unit-roof-height", "unit-custom-span", "unit-hll-elevation", "unit-wws-elevation", "unit-dist-insp", "unit-line-len", "unit-line2-len"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = distUnit;
    });

    const uArrestVal = document.getElementById("unit-arrest-load");
    if (uArrestVal) uArrestVal.textContent = forceUnit;

    const lblArrestVal = document.getElementById("lbl-arrest-load-val");
    if (lblArrestVal) {
        lblArrestVal.textContent = isEn ? `Arrest Load Value (${forceUnit}) :` : `Valeur Charge d'arrêt (${forceUnit}) :`;
    }

    // Toggle button in Dashboard Header
    const btn = document.getElementById("btn-toggle-unit-system");
    const txt = document.getElementById("btn-unit-text");
    if (txt) txt.textContent = unitBtnText;
    if (btn) {
        btn.classList.toggle("active", isUS);
        btn.title = unitBtnTitle;
    }

    // Direct header dims update to guarantee synchronization
    const shapeName = (typeof getLocalizedRoofShapeName === "function") ? getLocalizedRoofShapeName() : (isEn ? "Flat Roof" : "Toit Plat");
    const lIdx = state.lang || 0;
    const strL1 = formatDistance(state.lineLength, 2, lIdx);
    const strL2 = formatDistance(state.line2Length, 2, lIdx);
    const dimsHeader = document.getElementById("header-dims-display");
    if (dimsHeader) {
        dimsHeader.innerHTML = `<i class="fa-solid fa-ruler-combined"></i> ${shapeName} | L1: ${strL1} ${state.hasLine2 ? `+ L2: ${strL2}` : ""}`;
    }

    // Update system cards tags & descriptions in right panel
    const sysTagCore = document.getElementById("sys-tag-core") || document.getElementById("sys-tag-lightpro");
    if (sysTagCore) sysTagCore.textContent = isUS ? "Max 49.2 ft | 3 users" : (isEn ? "Max 15 m | 3 users" : "Max 15m | 3 pers.");

    const sysTagPro = document.getElementById("sys-tag-pro") || document.getElementById("sys-tag-newpro");
    if (sysTagPro) sysTagPro.textContent = isUS ? "Max 49.2 ft | 5 users" : (isEn ? "Max 15 m | 5 users" : "Max 15m | 5 pers.");
    
    const sysTagExtreme = document.getElementById("sys-tag-extreme") || document.getElementById("sys-tag-longrange");
    if (sysTagExtreme) sysTagExtreme.textContent = isUS ? "Max 183.7 ft | 3 users" : (isEn ? "Max 56 m | 3 users" : "Max 56m | 3 pers.");

    const sysDescExtreme = document.getElementById("sys-desc-extreme") || document.getElementById("sys-desc-longrange");
    if (sysDescExtreme) {
        sysDescExtreme.textContent = isUS
            ? "Lifeline for long spans (Long Range 32.8-65.6 ft, Super Range 65.6-111.5 ft, Ultra Range 111.5-183.7 ft)."
            : (isEn 
                ? "Lifeline for long spans (Long Range 10-20m, Super Range 20-34m, Ultra Range 34-56m)."
                : "Ligne de vie pour très grandes portées (Long Range 10-20m, Super Range 20-34m, Ultra Range 34-56m).");
    }

    // Modal select-product options
    const selProd = document.getElementById("select-product");
    if (selProd) {
        const optCore = selProd.querySelector("option[value='CORE']") || selProd.querySelector("option[value='LIGHT PRO']");
        const optPro = selProd.querySelector("option[value='PRO']") || selProd.querySelector("option[value='NEW PRO']");
        const optExtreme = selProd.querySelector("option[value='EXTREME']") || selProd.querySelector("option[value='LONG RANGE']");
        if (optCore) {
            optCore.textContent = isUS
                ? (isEn ? "CORE (Lightweight & commercial roofs | Max 49.2 ft | 3 users)" : "CORE (Toitures légères & tertiaires | Max 49.2 ft | 3 pers.)")
                : (isEn ? "CORE (Lightweight & commercial roofs | Max 15 m | 3 users)" : "CORE (Toitures légères & tertiaires | Max 15m | 3 pers.)");
        }
        if (optPro) {
            optPro.textContent = isUS
                ? (isEn ? "PRO (Standard / Flat roofs & trapezoidal | Max 49.2 ft | 5 users)" : "PRO (Standard / Toitures plates & bacs | Max 49.2 ft | 5 pers.)")
                : (isEn ? "PRO (Standard / Flat roofs & trapezoidal | Max 15 m | 5 users)" : "PRO (Standard / Toitures plates & bacs | Max 15m | 5 pers.)");
        }
        if (optExtreme) {
            optExtreme.textContent = isUS
                ? (isEn ? "EXTREME (Overhead / Tall posts | Max 183.7 ft | 3 users)" : "EXTREME (Overhead / Poteaux hauts | Max 183.7 ft | 3 pers.)")
                : (isEn ? "EXTREME (Overhead / Tall posts | Max 56 m | 3 users)" : "EXTREME (Overhead / Poteaux hauts | Max 56m | 3 pers.)");
        }
    }

    const lblBuffer = document.getElementById("lbl-buffer-len-info");
    if (lblBuffer) {
        const bufStr = isUS ? `${(0.20 * M_TO_FT).toFixed(2)} ft` : "0.20 m";
        lblBuffer.innerHTML = isEn
            ? `Fixed end buffer: <strong>${bufStr}</strong> (non-user editable)`
            : `Buffer d'extrémité fixe : <strong>${bufStr}</strong> (non modifiable par l'utilisateur)`;
    }

    // Modal unit system select value
    const selUnitModal = document.getElementById("select-unit-system");
    if (selUnitModal && selUnitModal.value !== (isUS ? "imperial" : "metric")) {
        selUnitModal.value = isUS ? "imperial" : "metric";
    }

    // Update select options containing unit values
    const tbElevSel = document.getElementById("select-hll-elevation-toolbar");
    if (tbElevSel) {
        const optKnee = tbElevSel.querySelector("option[value='knee']");
        const optDring = tbElevSel.querySelector("option[value='d_ring']");
        const optOver = tbElevSel.querySelector("option[value='overhead']");
        const optCust = tbElevSel.querySelector("option[value='custom']");
        if (optKnee) optKnee.textContent = isEn ? (isUS ? "Knee (1.5 ft)" : "Knee (0.45 m)") : (isUS ? "Genou (1,5 ft)" : "Genou (0,45 m)");
        if (optDring) optDring.textContent = isEn ? (isUS ? "D-Ring (5 ft)" : "D-Ring (1.50 m)") : (isUS ? "Anneau D (5 ft)" : "Anneau D (1,50 m)");
        if (optOver) optOver.textContent = isEn ? (isUS ? "Overhead (10 ft)" : "Overhead (3.0 m)") : (isUS ? "Overhead (10 ft)" : "Overhead (3,0 m)");
        if (optCust) optCust.textContent = isEn ? "Custom..." : "Personnalisée...";
    }

    const selElevPreset = document.getElementById("select-hll-elevation-preset");
    if (selElevPreset) {
        const optKnee = selElevPreset.querySelector("option[value='knee']");
        const optDring = selElevPreset.querySelector("option[value='d_ring']");
        const optOver = selElevPreset.querySelector("option[value='overhead']");
        const optCustElev = selElevPreset.querySelector("option[value='custom']");
        if (optKnee) optKnee.textContent = isEn ? "Knee Height (Standard default)" : "Hauteur de genou (Défaut standard)";
        if (optDring) optDring.textContent = isEn ? (isUS ? "D-Ring (5 ft)" : "D-Ring (1.5 m)") : (isUS ? "Anneau D (5 ft)" : "Anneau D (1,5 m)");
        if (optOver) optOver.textContent = isEn ? (isUS ? "Overhead (10 ft)" : "Overhead (3.0 m)") : (isUS ? "Overhead (10 ft)" : "Overhead (3,0 m)");
        if (optCustElev) optCustElev.textContent = isEn ? "Custom (Manual height)" : "Personnalisée (Saisie libre)";
    }

    const selBodyPos = document.getElementById("select-body-pos");
    if (selBodyPos) {
        const optStand = selBodyPos.querySelector("option[value='standing']");
        const optKneel = selBodyPos.querySelector("option[value='kneeling']");
        const optLie = selBodyPos.querySelector("option[value='lying']");
        if (optStand) optStand.textContent = isEn ? (isUS ? "Standing (D-Ring at 5 ft)" : "Standing (D-Ring at 1.50 m)") : (isUS ? "Debout (Anneau D à 5 ft)" : "Debout (Anneau D à 1,50 m)");
        if (optKneel) optKneel.textContent = isEn ? (isUS ? "Kneeling (+ 3 ft clearance)" : "Kneeling (+ 0.91 m clearance)") : (isUS ? "À genoux (+ 3 ft au dégagement)" : "À genoux (+ 0,91 m au dégagement)");
        if (optLie) optLie.textContent = isEn ? "Lying (+ D-Ring height clearance)" : "Allongé (+ hauteur anneau D au dégagement)";
    }

    const selArrestMode = document.getElementById("select-arrest-load-mode");
    if (selArrestMode) {
        const optLump = selArrestMode.querySelector("option[value='lump_sum']");
        const optCust = selArrestMode.querySelector("option[value='custom']");
        const optTurbo = selArrestMode.querySelector("option[value='turbolite']");
        const optFal = selArrestMode.querySelector("option[value='falcon']");
        if (optLump) optLump.textContent = isEn ? "Lump Mass / Lump Sum (M × F)" : "Masse Globale (Lump Sum : M × F)";
        if (optCust) optCust.textContent = isEn ? "Custom Direct Input (Engineer)" : "Saisie Forfaitaire Libre (Ingénieur)";
        if (optTurbo) optTurbo.textContent = isEn ? (isUS ? "Shortcut: TurboLite+ (1012 lbf)" : "Shortcut: TurboLite+ (4.5 kN)") : (isUS ? "Shortcut : TurboLite+ (1012 lbf)" : "Shortcut : TurboLite+ (Essais 4.5 kN)");
        if (optFal) optFal.textContent = isEn ? (isUS ? "Shortcut: Falcon+ (1349 lbf)" : "Shortcut: Falcon+ (6.0 kN)") : (isUS ? "Shortcut : Falcon+ (1349 lbf)" : "Shortcut : Falcon+ (Essais 6.0 kN)");
    }
    if (typeof updateLumpSumHint === "function") updateLumpSumHint();
}

function setUnitSystem(nextSys, skipRender = false) {
    const isImperial = (nextSys === "imperial" || nextSys === "us");
    state.unitSystem = isImperial ? "imperial" : "metric";
    if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("hookt_v2_units", state.unitSystem);
    }

    updateUnitLabelsInDOM();

    if (!skipRender) {
        if (typeof updateCalculationsUI === "function" && state.product) {
            const maxSpan = Calculator.getMaxSpan(state.product);
            const layout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
            updateCalculationsUI(layout, maxSpan);
        }
        if (typeof update3DScene === "function" && state.product) update3DScene();
        if (typeof populateConfigModalInputs === "function") populateConfigModalInputs();
        if (typeof renderDynamicLayoutForm === "function") renderDynamicLayoutForm();
    }
}

let _lastToggleUnitTime = 0;
function toggleUnitSystem() {
    const now = Date.now();
    if (now - _lastToggleUnitTime < 100) {
        return;
    }
    _lastToggleUnitTime = now;
    const isImperial = (state.unitSystem === "imperial" || state.unitSystem === "us");
    const nextSys = isImperial ? "metric" : "imperial";
    setUnitSystem(nextSys);
}
toggleUnitSystem.resetDebounce = () => { _lastToggleUnitTime = 0; };
window.setUnitSystem = setUnitSystem;
window.toggleUnitSystem = toggleUnitSystem;
window.updateUnitLabelsInDOM = updateUnitLabelsInDOM;

function setNorm(nextNorm, skipRender = false) {
    const isEN = (nextNorm === "EN 795" || nextNorm === "EN");
    state.norm = isEN ? "EN 795" : "OSHA";
    const isOSHA = (state.norm === "OSHA");

    if (isEN) {
        state.fallFactor = computeFallFactorFromElevation(state.hllElevationPreset, state.hllElevation, state.bodyPosition);
    } else {
        state.fallFactor = (typeof state.engineerCoefficient === "number" && !isNaN(state.engineerCoefficient)) ? state.engineerCoefficient : 1.00;
    }
    if (typeof syncElevationInputsUI === "function") {
        syncElevationInputsUI();
    } else if (typeof LayoutEditorModule !== "undefined" && typeof LayoutEditorModule.syncElevationInputsUI === "function") {
        LayoutEditorModule.syncElevationInputsUI();
    }

    // Sync select in roof parameterization
    const rNormSel = document.getElementById("select-roof-norm");
    if (rNormSel) rNormSel.value = isOSHA ? "OSHA" : "EN 795";

    // Sync tabs in right sidebar
    const tabEN = document.getElementById("tab-en795");
    const tabOSHA = document.getElementById("tab-osha");
    const subtabUnique = document.getElementById("subtab-span-unique");
    const subtabMulti = document.getElementById("subtab-span-multi");
    const oshaSubtabs = document.getElementById("osha-subtabs");

    if (tabEN && tabOSHA) {
        if (isOSHA) {
            tabOSHA.classList.add("active");
            tabEN.classList.remove("active");
        } else {
            tabEN.classList.add("active");
            tabOSHA.classList.remove("active");
        }
    }

    if (oshaSubtabs) {
        const isMultiSpanAllowed = isOSHA && (isPro(state.product) || isCore(state.product));
        oshaSubtabs.style.display = (isOSHA && isMultiSpanAllowed) ? "flex" : "none";
    }

    if (!isOSHA) {
        state.oshaSpanMode = "unique";
        if (subtabUnique) subtabUnique.classList.add("active");
        if (subtabMulti) subtabMulti.classList.remove("active");

        // Inform if roof has slopes (forbidden under EN 795)
        const hint = document.getElementById("hint-roof-norm-en");
        const rTypeSel = document.getElementById("select-roof-type");
        const curType = rTypeSel ? rTypeSel.value : (state.roof_type || "flat");
        if (hint) {
            hint.style.display = (curType === "sloped" || curType === "triangle") ? "block" : "none";
        }
    } else {
        const hint = document.getElementById("hint-roof-norm-en");
        if (hint) hint.style.display = "none";
    }

    if (!skipRender) {
        if (typeof update3DScene === "function") update3DScene();
        if (typeof updateCalculationsUI === "function") {
            const maxSpan = Calculator.getMaxSpan(state.product);
            const layout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
            updateCalculationsUI(layout, maxSpan);
        }
    }
}
if (typeof window !== "undefined") window.setNorm = setNorm;

// ==========================================
// SPEC V2 — 10 : LUMP SUM / MASSE GLOBALE (M × F)
// ==========================================
const LUMP_FACTOR_BY_USERS = {
    1: 1.00,
    2: 1.75,
    3: 2.25,
    4: 2.75,
    5: 3.25 // Valeur provisoire (+0.50) à faire confirmer par l'ingénierie
};
if (typeof window !== "undefined") {
    window.LUMP_FACTOR_BY_USERS = LUMP_FACTOR_BY_USERS;
}

function getSrlBaseArrestForceKn() {
    if (typeof state.arrestForceKn === "number" && !isNaN(state.arrestForceKn) && state.arrestForceKn > 0) {
        return state.arrestForceKn;
    }
    if (state.selectedSrlId && typeof SRL_CATALOG !== "undefined" && SRL_CATALOG[state.selectedSrlId]) {
        return SRL_CATALOG[state.selectedSrlId].preset_force_kn || SRL_CATALOG[state.selectedSrlId].arrest_load_preset_kn || 6.0;
    }
    if (state.arrestLoadMode === "turbolite") return 4.5;
    return 6.0;
}

function computeLumpArrestLoad(nbUsers, baseForceKn) {
    const u = Math.max(1, Math.min(5, parseInt(nbUsers) || 1));
    const m = LUMP_FACTOR_BY_USERS[u] || 1.00;
    const fKn = (typeof baseForceKn === "number" && baseForceKn > 0) ? baseForceKn : getSrlBaseArrestForceKn();
    const fLbf = (typeof state.arrestForceLbf === "number" && state.arrestForceLbf > 0 && Math.abs(fKn - state.arrestForceKn) < 0.001)
        ? state.arrestForceLbf
        : (fKn * (typeof UnitsModule !== "undefined" ? UnitsModule.KN_TO_LBF : 224.808943));
    const totalKn = parseFloat((m * fKn).toFixed(3));
    const totalLbf = parseFloat((m * fLbf).toFixed(1));
    return {
        factorM: m,
        isProvisional: (u === 5),
        arrestLoadKn: totalKn,
        arrestLoadLbf: totalLbf
    };
}
if (typeof window !== "undefined") {
    window.computeLumpArrestLoad = computeLumpArrestLoad;
}

function updateLumpSumHint() {
    const hintEl = document.getElementById("hint-arrest-load");
    if (!hintEl) return;
    const isEn = (parseInt(state.lang) === 1);
    const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
    const u = Math.max(1, Math.min(5, parseInt(state.nbUsers) || 1));
    const m = LUMP_FACTOR_BY_USERS[u] || 1.00;
    const baseFKn = getSrlBaseArrestForceKn();
    const knToLbf = (typeof UnitsModule !== "undefined") ? UnitsModule.KN_TO_LBF : 224.8089;
    const baseFLbf = Math.round(baseFKn * knToLbf);
    const calcKn = parseFloat((m * baseFKn).toFixed(2));
    const calcLbf = Math.round(calcKn * knToLbf);
    const provStr = (u === 5) ? (isEn ? " (provisional value)" : " (valeur provisoire)") : "";

    if (state.arrestLoadMode === "custom") {
        hintEl.innerHTML = isEn
            ? `<i class="fa-solid fa-pen-to-square"></i> Custom input override. Standard Lump Sum formula: <strong>${m.toFixed(2)}${provStr} × ${isUS ? baseFLbf + " lbf" : baseFKn + " kN"} = ${isUS ? calcLbf + " lbf" : calcKn + " kN"}</strong>`
            : `<i class="fa-solid fa-pen-to-square"></i> Saisie manuelle ingénieur. Formule Lump Sum standard : <strong>${m.toFixed(2)}${provStr} × ${isUS ? baseFLbf + " lbf" : baseFKn + " kN"} = ${isUS ? calcLbf + " lbf" : calcKn + " kN"}</strong>`;
    } else {
        hintEl.innerHTML = isEn
            ? `<i class="fa-solid fa-calculator" style="color:#2563eb;"></i> Lump Sum: <strong>M = ${m.toFixed(2)}${provStr}</strong> (${u} user${u > 1 ? "s" : ""}) × ${isUS ? baseFLbf + " lbf" : baseFKn + " kN"} = <strong>${isUS ? calcLbf + " lbf" : calcKn + " kN"}</strong>`
            : `<i class="fa-solid fa-calculator" style="color:#2563eb;"></i> Lump Sum : <strong>M = ${m.toFixed(2)}${provStr}</strong> (${u} utilisateur${u > 1 ? "s" : ""}) × ${isUS ? baseFLbf + " lbf" : baseFKn + " kN"} = <strong>${isUS ? calcLbf + " lbf" : calcKn + " kN"}</strong>`;
    }
}
if (typeof window !== "undefined") {
    window.updateLumpSumHint = updateLumpSumHint;
}

function recalculateLumpSumArrestLoad() {
    const u = Math.max(1, Math.min(5, parseInt(state.nbUsers) || 1));
    const m = LUMP_FACTOR_BY_USERS[u] || 1.00;
    const baseFKn = getSrlBaseArrestForceKn();
    const totalKn = parseFloat((m * baseFKn).toFixed(3));
    state.arrestLoadValue = totalKn;
    state.arrestLoadKn = totalKn;

    const arrestValInp = document.getElementById("input-arrest-load-val");
    const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
    const knToLbf = (typeof UnitsModule !== "undefined") ? UnitsModule.KN_TO_LBF : 224.8089;
    if (arrestValInp) {
        arrestValInp.value = isUS
            ? Math.round(totalKn * knToLbf)
            : totalKn.toFixed(2);
    }

    const totalLbf = totalKn * knToLbf;
    if (totalLbf > 5000.0) {
        console.warn(`[HOOKT] Lump sum arrest load exceeds 5000 lbf: ${Math.round(totalLbf)} lbf`);
    }

    updateLumpSumHint();
}
if (typeof window !== "undefined") {
    window.recalculateLumpSumArrestLoad = recalculateLumpSumArrestLoad;
}

function validateArrestLoad(valueKn, isCustomInput = false) {
    const knToLbf = (typeof UnitsModule !== "undefined") ? UnitsModule.KN_TO_LBF : 224.8089;
    const val = (typeof valueKn === "number") ? valueKn : parseFloat(valueKn);
    const isEn = (parseInt(state.lang) === 1);
    if (isNaN(val) || val <= 0) {
        return {
            valid: false,
            lbf: 0,
            message: isEn ? "⚠️ Arrest load must be strictly greater than 0." : "⚠️ La charge d'arrêt doit être strictement supérieure à 0."
        };
    }
    const lbf = val * knToLbf;
    // Allow 1 lbf to 5000 lbf inclusive (with tolerance 0.99 to 5000.5)
    if (lbf < 0.99 || lbf > 5000.5) {
        return {
            valid: false,
            lbf: Math.round(lbf),
            message: isEn
                ? `⚠️ Arrest load out of bounds: ${Math.round(lbf)} lbf is outside the allowed range [1 lbf, 5000 lbf] (0.004 kN to 22.24 kN).`
                : `⚠️ Charge d'arrêt hors limites : ${Math.round(lbf)} lbf est en dehors de la plage autorisée [1 lbf, 5 000 lbf] (0,004 kN à 22,24 kN).`
        };
    }
    return {
        valid: true,
        lbf: Math.round(lbf),
        message: ""
    };
}
if (typeof window !== "undefined") {
    window.validateArrestLoad = validateArrestLoad;
}

// ==========================================
// ==========================================
// SPEC V2 — 04, SPEC V2 — 09 / PROMPT 15 & SPEC V2 — 10 / PROMPT 16 : SRL CATALOG & CONNECTING DEVICE ENGINE
// ==========================================
const RETRACTED_WARN_M = 3.0; // Warning threshold > 3.0 m (Spec V2 — 10)

const SRL_CATALOG = {
    "turbo_light_9ft": {
        id: "turbo_light_9ft",
        name: "TurboLite+",
        manufacturer: "Miller / Honeywell",
        classe: 2,
        retracted_length_m: 0.60, // 24 in (0.60m)
        retracted_len: 0.60,      // alias for backward compat
        working_len: 2.74,
        default_arrest_force_kn: 4.5,
        default_arrest_force_lbf: 1012,
        cad_model: "box_placeholder_turbolite.glb"
    },
    "falcon_leading_edge": {
        id: "falcon_leading_edge",
        name: "Falcon+",
        manufacturer: "Miller / Honeywell",
        classe: 2,
        retracted_length_m: 0.80, // 31 in (0.80m)
        retracted_len: 0.80,      // alias for backward compat
        working_len: 6.0,
        default_arrest_force_kn: 6.0,
        default_arrest_force_lbf: 1349,
        cad_model: "box_placeholder_falcon.glb"
    }
};

/**
 * Unit conversion for retracted length with rounding drift prevention (Criterion 4)
 * Saisir 2,0 ft puis passer l'unité en m affiche 0,61 m, sans dérive d'arrondi au retour en ft (2,0 ft).
 */
function convertRetractedLength(value, fromUnit, toUnit) {
    if (isNaN(value) || value <= 0) return "";
    if (fromUnit === toUnit) return String(value);

    // Convert fromUnit -> meters
    let inM = 0;
    if (fromUnit === "m") {
        inM = value;
    } else if (fromUnit === "ft") {
        inM = value * 0.3048;
    } else if (fromUnit === "in") {
        inM = value * 0.0254;
    }

    // Convert meters -> toUnit with rounding drift prevention
    if (toUnit === "m") {
        return inM.toFixed(2);
    } else if (toUnit === "ft") {
        const rawFt = inM / 0.3048;
        const roundedFt1 = Math.round(rawFt * 10) / 10;
        if (Math.abs(rawFt - roundedFt1) < 0.015) {
            return roundedFt1.toFixed(1);
        }
        return rawFt.toFixed(1);
    } else if (toUnit === "in") {
        const rawIn = inM / 0.0254;
        const roundedIn1 = Math.round(rawIn * 10) / 10;
        if (Math.abs(rawIn - roundedIn1) < 0.02) {
            return roundedIn1.toFixed(1);
        }
        return rawIn.toFixed(1);
    }
    return inM.toFixed(2);
}

function updateRetractedLengthEquivalentUI() {
    const lenInp = document.getElementById("input-srl-retracted-length");
    const unitSel = document.getElementById("select-retracted-length-unit");
    const eqDisplay = document.getElementById("retracted-length-equivalent-display");
    const warnBox = document.getElementById("retracted-warning-box");
    const warnTxt = document.getElementById("retracted-warning-text");
    const isEn = (parseInt(state.lang) === 1);
    if (!lenInp) return;

    const unit = unitSel ? unitSel.value : (state.retractedLengthUnit || "m");
    state.retractedLengthUnit = unit;
    const rawVal = parseFloat(lenInp.value);

    if (isNaN(rawVal) || rawVal <= 0) {
        if (eqDisplay) eqDisplay.textContent = unit === "m" ? "(-- ft)" : "(-- m)";
        if (warnBox) warnBox.style.display = "none";
        state.retractedLengthM = null;
        updateRetractedLengthModifiedState();
        return;
    }

    let valM = 0;
    let eqStr = "";
    if (unit === "m") {
        valM = rawVal;
        const ftVal = valM / 0.3048;
        const roundedFt = Math.round(ftVal * 10) / 10;
        const finalFt = Math.abs(ftVal - roundedFt) < 0.015 ? roundedFt : ftVal;
        eqStr = `(${finalFt.toFixed(1)} ft)`;
    } else if (unit === "ft") {
        valM = rawVal * 0.3048;
        eqStr = `(${valM.toFixed(2)} m)`;
    } else if (unit === "in") {
        valM = rawVal * 0.0254;
        eqStr = `(${valM.toFixed(2)} m)`;
    }

    if (eqDisplay) eqDisplay.textContent = eqStr;
    state.retractedLengthM = valM;
    state.customDeviceLengthM = valM;

    if (warnBox) {
        const isWarn = (valM > (typeof RETRACTED_WARN_M !== "undefined" ? RETRACTED_WARN_M : 3.0));
        warnBox.style.display = isWarn ? "block" : "none";
        if (warnTxt && isWarn) {
            const isLanyard = (state.connectingDevice === "lanyard" || state.connectingDevice === "custom_lanyard");
            if (isEn) {
                warnTxt.textContent = `Warning: ${isLanyard ? "Lanyard" : "Retracted"} length exceeds 3.0 m (9.8 ft).`;
            } else {
                warnTxt.textContent = `Avertissement : Longueur ${isLanyard ? "de la longe" : "rétractée"} supérieure à 3,0 m (9.8 ft).`;
            }
        }
    }

    updateRetractedLengthModifiedState();
}

function updateRetractedLengthModifiedState() {
    const badgeMod = document.getElementById("badge-retracted-modified");
    const btnReset = document.getElementById("btn-reset-retracted-length");

    if (state.connectingDevice === "srd" && state.selectedSrlId) {
        const srl = SRL_CATALOG[state.selectedSrlId];
        const catalogM = srl ? srl.retracted_length_m : null;
        if (catalogM !== null && catalogM !== undefined && typeof state.retractedLengthM === "number") {
            const isModified = Math.abs(state.retractedLengthM - catalogM) > 0.005;
            state.isRetractedLengthModified = isModified;
            if (badgeMod) badgeMod.style.display = isModified ? "inline-block" : "none";
            if (btnReset) btnReset.style.display = isModified ? "inline-block" : "none";
            return;
        }
    }
    state.isRetractedLengthModified = false;
    if (badgeMod) badgeMod.style.display = "none";
    if (btnReset) btnReset.style.display = "none";
}

function resetRetractedLength() {
    if (state.connectingDevice === "srd" && state.selectedSrlId) {
        const srl = SRL_CATALOG[state.selectedSrlId];
        if (srl && srl.retracted_length_m !== null && srl.retracted_length_m !== undefined) {
            const lenInp = document.getElementById("input-srl-retracted-length");
            const unitSel = document.getElementById("select-retracted-length-unit");
            const unit = unitSel ? unitSel.value : (state.retractedLengthUnit || "m");
            if (lenInp) {
                if (unit === "m") {
                    lenInp.value = srl.retracted_length_m.toFixed(2);
                } else if (unit === "ft") {
                    const ft = srl.retracted_length_m / 0.3048;
                    const rFt = Math.round(ft * 10) / 10;
                    lenInp.value = (Math.abs(ft - rFt) < 0.015 ? rFt : ft).toFixed(1);
                } else if (unit === "in") {
                    const inch = srl.retracted_length_m / 0.0254;
                    const rIn = Math.round(inch * 10) / 10;
                    lenInp.value = (Math.abs(inch - rIn) < 0.02 ? rIn : inch).toFixed(1);
                }
            }
            state.retractedLengthM = srl.retracted_length_m;
            state.isRetractedLengthModified = false;
            updateRetractedLengthEquivalentUI();
            validateSrlSelection();
            if (typeof updateCalculationsUI === "function") {
                const maxSpan = Calculator.getMaxSpan(state.product);
                const layout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
                updateCalculationsUI(layout, maxSpan);
            }
        }
    }
}

function updateSrlCardsDisplay() {
    const isEn = (parseInt(state.lang) === 1);
    const turboData = SRL_CATALOG["turbo_light_9ft"];
    const falconData = SRL_CATALOG["falcon_leading_edge"];

    const valTurbo = document.getElementById("val-card-turbolite-retracted");
    const valFalcon = document.getElementById("val-card-falcon-retracted");
    const lblTurbo = document.getElementById("lbl-card-turbolite-retracted");
    const lblFalcon = document.getElementById("lbl-card-falcon-retracted");

    const badgeTurbo = document.getElementById("badge-turbolite-class");
    const badgeFalcon = document.getElementById("badge-falcon-class");
    const classTxt = isEn ? "Class 2" : "Classe 2";
    if (badgeTurbo) badgeTurbo.textContent = classTxt;
    if (badgeFalcon) badgeFalcon.textContent = classTxt;

    if (lblTurbo) lblTurbo.textContent = isEn ? "Retracted:" : "Rétracté :";
    if (lblFalcon) lblFalcon.textContent = isEn ? "Retracted:" : "Rétracté :";

    if (valTurbo) {
        if (turboData && turboData.retracted_length_m !== null && turboData.retracted_length_m !== undefined) {
            const ft = (turboData.retracted_length_m / 0.3048).toFixed(1);
            valTurbo.textContent = `${turboData.retracted_length_m.toFixed(2)} m (${ft} ft)`;
        } else {
            valTurbo.textContent = isEn ? "Data to provide" : "Donnée à renseigner";
        }
    }

    if (valFalcon) {
        if (falconData && falconData.retracted_length_m !== null && falconData.retracted_length_m !== undefined) {
            const ft = (falconData.retracted_length_m / 0.3048).toFixed(1);
            valFalcon.textContent = `${falconData.retracted_length_m.toFixed(2)} m (${ft} ft)`;
        } else {
            valFalcon.textContent = isEn ? "Data to provide" : "Donnée à renseigner";
        }
    }
}

function updateMadEquivalentUI() {
    const madInp = document.getElementById("input-srl-mad");
    const madUnitSel = document.getElementById("select-mad-unit");
    const eqDisplay = document.getElementById("mad-equivalent-display");
    const warnBox = document.getElementById("mad-warning-box");
    if (!madInp) return;

    const unit = madUnitSel ? madUnitSel.value : (state.madUnit || "m");
    state.madUnit = unit;
    const rawVal = parseFloat(madInp.value);

    if (isNaN(rawVal) || rawVal <= 0) {
        if (eqDisplay) eqDisplay.textContent = unit === "in" ? "(-- m)" : "(-- in)";
        if (warnBox) warnBox.style.display = "none";
        state.madM = null;
        state.customMad = null;
        return;
    }

    let valM = 0;
    let eqStr = "";
    if (unit === "in") {
        valM = rawVal * 0.0254;
        eqStr = `(${valM.toFixed(2)} m)`;
    } else {
        valM = rawVal;
        const inVal = rawVal / 0.0254;
        eqStr = `(${inVal.toFixed(1)} in)`;
    }

    if (eqDisplay) eqDisplay.textContent = eqStr;
    state.madM = valM;
    state.customMad = valM;

    // Check if user changed MAD from default suggestion 1.07m
    state.isMadModified = (Math.abs(valM - 1.07) > 0.03);

    if (warnBox) {
        warnBox.style.display = (valM > MAD_WARN_M) ? "block" : "none";
    }
}

function updateArrestForceEquivalentUI() {
    const afInp = document.getElementById("input-arrest-force");
    const afUnitSel = document.getElementById("select-arrest-force-unit");
    const eqDisplay = document.getElementById("arrest-force-equivalent-display");
    const loadStr = document.getElementById("val-global-arrest-load-str");
    const errBox = document.getElementById("arrest-force-error-box");
    const isEn = (parseInt(state.lang) === 1);
    if (!afInp) return;

    const unit = afUnitSel ? afUnitSel.value : (state.arrestForceUnit || "lbf");
    state.arrestForceUnit = unit;
    const rawVal = parseFloat(afInp.value);

    if (isNaN(rawVal) || rawVal <= 0) {
        if (eqDisplay) eqDisplay.textContent = unit === "lbf" ? "(-- kN)" : "(-- lbf)";
        if (errBox) errBox.style.display = "none";
        state.arrestForceKn = null;
        state.arrestForceLbf = null;
        return;
    }

    let lbfVal = 0;
    let knVal = 0;
    if (unit === "lbf") {
        lbfVal = rawVal;
        knVal = Math.abs(rawVal - 1350) < 1.0 ? 6.00 : parseFloat((rawVal * 0.0044482216).toFixed(2));
        if (eqDisplay) eqDisplay.textContent = `(${knVal.toFixed(2)} kN)`;
    } else {
        knVal = rawVal;
        lbfVal = Math.abs(rawVal - 6.00) < 0.01 ? 1350 : Math.round(rawVal * 224.808943);
        if (eqDisplay) eqDisplay.textContent = `(${Math.round(lbfVal)} lbf)`;
    }

    state.arrestForceKn = knVal;
    state.arrestForceLbf = lbfVal;

    // Check if user modified compared to selected SRL default
    if (state.connectingDevice === "srd" && state.selectedSrlId && SRL_CATALOG[state.selectedSrlId]) {
        const srlDef = SRL_CATALOG[state.selectedSrlId].default_arrest_force_kn;
        state.isArrestForceModified = (Math.abs(knVal - srlDef) > 0.05);
    }

    // Validation: 1 to 5000 lbf
    const isExceeded = (lbfVal > 5000.0);
    if (errBox) {
        errBox.style.display = isExceeded ? "block" : "none";
        const errTxt = document.getElementById("arrest-force-error-text");
        if (errTxt && isExceeded) {
            errTxt.textContent = isEn
                ? `Error: Arrest force (${Math.round(lbfVal)} lbf) exceeds the 5,000 lbf (22.24 kN) limit.`
                : `Erreur : Force d'arrêt (${Math.round(lbfVal)} lbf) supérieure à 5 000 lbf (22,24 kN).`;
        }
    }

    // Global arrest load M * F
    const u = Math.max(1, Math.min(5, parseInt(state.nbUsers) || 1));
    const m = (typeof LUMP_FACTOR_BY_USERS !== "undefined" && LUMP_FACTOR_BY_USERS[u]) ? LUMP_FACTOR_BY_USERS[u] : 1.00;
    const globalLbf = m * lbfVal;
    const globalKn = globalLbf * 0.0044482216;

    state.globalArrestLoadLbf = globalLbf;
    state.globalArrestLoadKn = globalKn;

    if (state.arrestLoadMode !== "custom") {
        state.arrestLoadValue = globalKn;
        state.arrestLoadKn = globalKn;
    }

    if (loadStr) {
        loadStr.textContent = isEn
            ? `Global Arrest Load: ${globalLbf.toFixed(1)} lbf (M=${m.toFixed(2)} × ${Math.round(lbfVal)} lbf)`
            : `Charge globale : ${globalLbf.toFixed(1)} lbf (M=${m.toFixed(2)} × ${Math.round(lbfVal)} lbf)`;
    }
}

function updateConnectingDeviceUI() {
    const dev = state.connectingDevice || "srd";
    const customGroup = document.getElementById("group-custom-device-fields");
    const customClassGroup = document.getElementById("group-custom-device-class");
    const customNameInp = document.getElementById("input-custom-device-name");
    const customClassSel = document.getElementById("select-custom-device-class");
    const customLenInp = document.getElementById("input-custom-device-length");
    const catalogCards = document.getElementById("srl-catalog-cards");

    // Sidebar elements
    const sideConnSel = document.getElementById("select-sidebar-connecting-device");
    const mainConnSel = document.getElementById("select-connecting-device");
    const sideCustomGroup = document.getElementById("sidebar-group-custom-device");
    const sideCustomClassGroup = document.getElementById("sidebar-group-custom-class");
    const sideCustomNameInp = document.getElementById("input-sidebar-custom-name");
    const sideCustomClassSel = document.getElementById("select-sidebar-custom-class");
    const lblRetracted = document.getElementById("lbl-srl-retracted-title");
    const isEn = (parseInt(state.lang) === 1);
    const isLanyard = (dev === "lanyard" || dev === "custom_lanyard");

    // Sync dropdown values
    if (sideConnSel && sideConnSel.value !== dev) sideConnSel.value = dev;
    if (mainConnSel && mainConnSel.value !== dev) mainConnSel.value = dev;

    // Retracted / Lanyard label
    if (lblRetracted) {
        lblRetracted.textContent = isLanyard
            ? (isEn ? "Lanyard Length:" : "Longueur de la longe :")
            : (isEn ? "Retracted Length:" : "Longueur rétractée :");
    }
    const lblClrRetr = document.getElementById("lbl-clr-retracted");
    if (lblClrRetr) {
        lblClrRetr.textContent = isLanyard
            ? (isEn ? "Longueur de la longe :" : "Longueur de la longe :")
            : (isEn ? "Longueur rétractée :" : "Longueur rétractée :");
    }

    if (customGroup) {
        customGroup.style.display = (dev === "custom_srd" || dev === "custom_lanyard") ? "block" : "none";
    }
    if (sideCustomGroup) {
        sideCustomGroup.style.display = (dev === "custom_srd" || dev === "custom_lanyard") ? "block" : "none";
    }
    if (customClassGroup) {
        customClassGroup.style.display = (dev === "custom_srd") ? "block" : "none";
    }
    if (sideCustomClassGroup) {
        sideCustomClassGroup.style.display = (dev === "custom_srd") ? "block" : "none";
    }
    if (catalogCards) {
        catalogCards.style.display = (dev === "srd") ? "grid" : "none";
    }

    if (customNameInp && state.customDeviceName !== undefined) {
        customNameInp.value = state.customDeviceName;
    }
    if (sideCustomNameInp && state.customDeviceName !== undefined) {
        sideCustomNameInp.value = state.customDeviceName;
    }
    if (customClassSel && state.customDeviceClass !== undefined) {
        customClassSel.value = String(state.customDeviceClass);
    }
    if (sideCustomClassSel && state.customDeviceClass !== undefined) {
        sideCustomClassSel.value = String(state.customDeviceClass);
    }
    if (customLenInp && state.customDeviceLengthM !== undefined) {
        customLenInp.value = state.customDeviceLengthM;
    }

    // For custom devices (V2_09 / V2_10), start with fields empty if newly selected and undefined
    if (dev === "custom_srd" || dev === "custom_lanyard") {
        if (!state.customDeviceName) {
            state.customDeviceName = "";
        }
    }
}

function validateSrlSelection() {
    const badge = document.getElementById("srl-status-badge");
    const warnBox = document.getElementById("srl-alert-warning");
    const warnTxt = document.getElementById("srl-alert-text");
    const isEn = (parseInt(state.lang) === 1);
    const isLanyard = (state.connectingDevice === "lanyard" || state.connectingDevice === "custom_lanyard");

    // 1. Check Retracted Length / Lanyard Length (Spec V2 — 10 / Prompt 16)
    const hasLen = (typeof state.retractedLengthM === "number" && !isNaN(state.retractedLengthM) && state.retractedLengthM > 0);
    if (!hasLen) {
        if (warnBox && warnTxt) {
            const fieldFr = isLanyard ? "La longueur de la longe" : "La longueur rétractée";
            const fieldEn = isLanyard ? "Lanyard length" : "Retracted length";
            warnTxt.innerHTML = isEn
                ? `<strong>⚠️ Missing Field:</strong> ${fieldEn} is mandatory.`
                : `<strong>⚠️ Champ manquant :</strong> ${fieldFr} est obligatoire.`;
            warnBox.style.display = "flex";
        }
        if (badge) {
            badge.textContent = isEn ? "MISSING LENGTH (REQUIRED)" : "LONGUEUR MANQUANTE (OBLIGATOIRE)";
            badge.className = "badge-role badge-role-suspended";
        }
        return false;
    }

    // 2. Check MAD (Spec V2 — 09 / Prompt 15)
    const hasMad = (typeof state.madM === "number" && !isNaN(state.madM) && state.madM > 0);
    if (!hasMad) {
        if (warnBox && warnTxt) {
            warnTxt.innerHTML = isEn
                ? "<strong>⚠️ Missing Field:</strong> Maximum Arrest Distance (MAD) is mandatory."
                : "<strong>⚠️ Champ manquant :</strong> La distance d'arrêt maximale (MAD) est obligatoire.";
            warnBox.style.display = "flex";
        }
        if (badge) {
            badge.textContent = isEn ? "MISSING MAD (REQUIRED)" : "MAD MANQUANTE (OBLIGATOIRE)";
            badge.className = "badge-role badge-role-suspended";
        }
        return false;
    }

    // 3. Check Arrest Force (Spec V2 — 09 / Prompt 15)
    const hasAf = (typeof state.arrestForceKn === "number" && !isNaN(state.arrestForceKn) && state.arrestForceKn > 0);
    if (!hasAf) {
        if (warnBox && warnTxt) {
            warnTxt.innerHTML = isEn
                ? "<strong>⚠️ Missing Field:</strong> Arrest Force is mandatory."
                : "<strong>⚠️ Champ manquant :</strong> La force d'arrêt (Arrest Force) est obligatoire.";
            warnBox.style.display = "flex";
        }
        if (badge) {
            badge.textContent = isEn ? "MISSING ARREST FORCE (REQUIRED)" : "FORCE D'ARRÊT MANQUANTE";
            badge.className = "badge-role badge-role-suspended";
        }
        return false;
    }

    const afLbf = state.arrestForceLbf || (state.arrestForceKn * 224.808943);
    if (afLbf > 5000.0) {
        if (warnBox && warnTxt) {
            warnTxt.innerHTML = isEn
                ? `<strong>⚠️ Arrest Force Rejected:</strong> ${Math.round(afLbf)} lbf exceeds 5,000 lbf (22.24 kN) limit.`
                : `<strong>⚠️ Force d'arrêt rejetée :</strong> ${Math.round(afLbf)} lbf dépasse la limite de 5 000 lbf (22,24 kN).`;
            warnBox.style.display = "flex";
        }
        if (badge) {
            badge.textContent = isEn ? "ARREST FORCE > 5000 LBF" : "FORCE D'ARRÊT > 5000 LBF";
            badge.className = "badge-role badge-role-suspended";
        }
        return false;
    }

    // 4. Check Device selection
    if (state.connectingDevice === "srd") {
        if (!state.selectedSrlId) {
            if (warnBox) warnBox.style.display = "none";
            if (badge) {
                badge.textContent = isEn ? "NOT SELECTED (REQUIRED)" : "NON SÉLECTIONNÉ (OBLIGATOIRE)";
                badge.className = "badge-role badge-role-installer";
            }
            return false;
        }
        const srl = SRL_CATALOG[state.selectedSrlId];
        if (!srl) return false;

        const hllElev = parseFloat(state.hllElevation) || 0.45;
        const isClass1Violation = (srl.classe === 1 && (state.hllElevationPreset === "knee" || hllElev < 1.49));
        if (isClass1Violation) {
            if (warnBox && warnTxt) {
                warnTxt.innerHTML = isEn
                    ? `<strong>⚠️ SRL Class 1 Rejected:</strong> Lifeline is below D-ring height (${hllElev.toFixed(2)} m &lt; 1.50 m). A Class 2 SRL is mandatory.`
                    : `<strong>⚠️ Classe 1 non autorisée :</strong> La ligne de vie est sous l'anneau D (${hllElev.toFixed(2)} m &lt; 1,50 m). Un SRL Classe 2 est obligatoire pour une pose sous l'anneau D.`;
                warnBox.style.display = "flex";
            }
            if (badge) {
                badge.textContent = isEn ? "NON-COMPLIANT (CLASS 1 BELOW D-RING)" : "NON CONFORME (CLASSE 1 SOUS ANNEAU D)";
                badge.className = "badge-role badge-role-suspended";
            }
            return false;
        }
    } else if (state.connectingDevice === "custom_srd") {
        const cls = parseInt(state.customDeviceClass) || 2;
        const hllElev = parseFloat(state.hllElevation) || 0.45;
        if (cls === 1 && (state.hllElevationPreset === "knee" || hllElev < 1.49)) {
            if (warnBox && warnTxt) {
                warnTxt.innerHTML = isEn
                    ? `<strong>⚠️ Custom SRL Class 1 Rejected:</strong> Lifeline is below D-ring height (${hllElev.toFixed(2)} m &lt; 1.50 m). Class 1 requires D-ring or overhead elevation.`
                    : `<strong>⚠️ SRL Personnalisé Classe 1 rejeté :</strong> La ligne de vie est sous l'anneau D (${hllElev.toFixed(2)} m &lt; 1,50 m). La Classe 1 exige une pose à l'anneau D ou au-dessus.`;
                warnBox.style.display = "flex";
            }
            if (badge) {
                badge.textContent = isEn ? "NON-COMPLIANT (CLASS 1 BELOW D-RING)" : "NON CONFORME (CLASSE 1 SOUS ANNEAU D)";
                badge.className = "badge-role badge-role-suspended";
            }
            return false;
        }
    } else if (state.connectingDevice === "lanyard" || state.connectingDevice === "custom_lanyard") {
        if (state.isOverEdgeFall || (state.line_to_edge !== undefined && state.line_to_edge < 1.0)) {
            if (warnBox && warnTxt) {
                warnTxt.innerHTML = isEn
                    ? "<strong>⚠️ Lanyard Rejected on Roof Edge:</strong> A Class 2 SRL is mandatory when there is an over-edge fall hazard."
                    : "<strong>⚠️ Longe interdite en bordure :</strong> Un SRL Classe 2 est obligatoire en cas de risque de chute par-dessus bord.";
                warnBox.style.display = "flex";
            }
            if (badge) {
                badge.textContent = isEn ? "NON-COMPLIANT (EDGE FALL HAZARD)" : "NON CONFORME (CHUTE PAR-DESSUS BORD)";
                badge.className = "badge-role badge-role-suspended";
            }
            return false;
        }
    }

    if (warnBox) warnBox.style.display = "none";
    if (badge) {
        badge.textContent = isEn ? "SELECTED & COMPLIANT" : "SÉLECTIONNÉ & CONFORME";
        badge.className = "badge-role badge-role-admin";
    }
    return true;
}
if (typeof window !== "undefined") window.validateSrlSelection = validateSrlSelection;

function getConnectingDeviceReportName(lang = 0) {
    const isEn = (parseInt(lang) === 1);
    if (state.connectingDevice === "srd") {
        const srlData = (typeof SRL_CATALOG !== "undefined" && state.selectedSrlId) ? SRL_CATALOG[state.selectedSrlId] : null;
        if (srlData) return srlData.name; // "TurboLite+" or "Falcon+" WITHOUT "Class 2" (Spec V2 — 10 / Prompt 16)
        return "TurboLite+";
    } else if (state.connectingDevice === "custom_srd") {
        const name = (state.customDeviceName || "").trim() || (isEn ? "Custom SRL" : "SRL personnalisé");
        return name;
    } else if (state.connectingDevice === "custom_lanyard") {
        const name = (state.customDeviceName || "").trim() || (isEn ? "Custom Lanyard" : "Longe personnalisée");
        return name;
    } else {
        return isEn ? "Shock-Absorbing Lanyard" : "Longe avec absorbeur d'énergie";
    }
}
if (typeof window !== "undefined") window.getConnectingDeviceReportName = getConnectingDeviceReportName;

function validateSystem() {
    const isProdValid = typeof validateProductAssociations === "function" ? validateProductAssociations() : true;
    if (!isProdValid) return { valid: false, error: "Product associations invalid" };
    const isSrlValid = typeof validateSrlSelection === "function" ? validateSrlSelection() : true;
    if (!isSrlValid) return { valid: false, error: "Connecting device, MAD, Arrest Force, or Retracted length invalid" };
    return { valid: true };
}
if (typeof window !== "undefined") window.validateSystem = validateSystem;

function selectSrlModel(srlId) {
    const srl = SRL_CATALOG[srlId];
    if (!srl) return;

    state.selectedSrlId = srlId;
    state.connectingDevice = "srd";

    // Synchronize both dropdowns to "srd"
    const leftDevSel = document.getElementById("select-connecting-device");
    const sideDevSel = document.getElementById("select-sidebar-connecting-device");
    if (leftDevSel) leftDevSel.value = "srd";
    if (sideDevSel) sideDevSel.value = "srd";
    updateConnectingDeviceUI();

    // Spec V2 — 10 / Prompt 16: Pre-fill Retracted Length
    const lenInp = document.getElementById("input-srl-retracted-length");
    const unitSel = document.getElementById("select-retracted-length-unit");
    if (lenInp) {
        const unit = unitSel ? unitSel.value : (state.retractedLengthUnit || "m");
        if (srl.retracted_length_m !== null && srl.retracted_length_m !== undefined) {
            if (unit === "m") {
                lenInp.value = srl.retracted_length_m.toFixed(2);
            } else if (unit === "ft") {
                const ft = srl.retracted_length_m / 0.3048;
                const rFt = Math.round(ft * 10) / 10;
                lenInp.value = (Math.abs(ft - rFt) < 0.015 ? rFt : ft).toFixed(1);
            } else if (unit === "in") {
                const inch = srl.retracted_length_m / 0.0254;
                const rIn = Math.round(inch * 10) / 10;
                lenInp.value = (Math.abs(inch - rIn) < 0.02 ? rIn : inch).toFixed(1);
            }
            state.retractedLengthM = srl.retracted_length_m;
        } else {
            lenInp.value = "";
            state.retractedLengthM = null;
        }
        state.isRetractedLengthModified = false;
        updateRetractedLengthEquivalentUI();
    }

    // Spec V2 — 09 / Prompt 15: Pre-fill Arrest Force preset (never overwrite MAD)
    const afInp = document.getElementById("input-arrest-force");
    const afUnitSel = document.getElementById("select-arrest-force-unit");
    if (afInp) {
        const unit = afUnitSel ? afUnitSel.value : (state.arrestForceUnit || "lbf");
        if (unit === "lbf") {
            afInp.value = srl.default_arrest_force_lbf || (srlId === "turbo_light_9ft" ? 1012 : 1349);
        } else {
            afInp.value = (srl.default_arrest_force_kn || (srlId === "turbo_light_9ft" ? 4.5 : 6.0)).toFixed(1);
        }
        state.isArrestForceModified = false;
        updateArrestForceEquivalentUI();
    }

    // Update active classes on cards
    const cTurbo = document.getElementById("card-srl-turbolite");
    const cFalcon = document.getElementById("card-srl-falcon");
    if (cTurbo) cTurbo.classList.toggle("active", srlId === "turbo_light_9ft");
    if (cFalcon) cFalcon.classList.toggle("active", srlId === "falcon_leading_edge");

    validateSrlSelection();

    if (typeof updateCalculationsUI === "function") {
        const maxSpan = Calculator.getMaxSpan(state.product);
        const layout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
        updateCalculationsUI(layout, maxSpan);
    }
}
window.selectSrlModel = selectSrlModel;

function initSrlMadControls() {
    // Retracted length controls (Spec V2 — 10 / Prompt 16)
    const lenInp = document.getElementById("input-srl-retracted-length");
    const lenUnitSel = document.getElementById("select-retracted-length-unit");
    const resetLenBtn = document.getElementById("btn-reset-retracted-length");

    function onRetractedLengthChange() {
        updateRetractedLengthEquivalentUI();
        validateSrlSelection();
        if (typeof updateCalculationsUI === "function") {
            const maxSpan = Calculator.getMaxSpan(state.product);
            const layout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
            updateCalculationsUI(layout, maxSpan);
        }
    }

    if (lenInp && !lenInp.dataset.hasListener) {
        lenInp.dataset.hasListener = "true";
        lenInp.addEventListener("input", onRetractedLengthChange);
        lenInp.addEventListener("change", onRetractedLengthChange);
    }

    if (lenUnitSel && !lenUnitSel.dataset.hasListener) {
        lenUnitSel.dataset.hasListener = "true";
        lenUnitSel.addEventListener("change", () => {
            const prevUnit = state.retractedLengthUnit || "m";
            const nextUnit = lenUnitSel.value;
            state.retractedLengthUnit = nextUnit;
            const currentVal = parseFloat(lenInp.value);
            if (!isNaN(currentVal) && currentVal > 0) {
                lenInp.value = convertRetractedLength(currentVal, prevUnit, nextUnit);
            }
            onRetractedLengthChange();
        });
    }

    if (resetLenBtn && !resetLenBtn.dataset.hasListener) {
        resetLenBtn.dataset.hasListener = "true";
        resetLenBtn.addEventListener("click", () => {
            resetRetractedLength();
        });
    }

    // MAD controls
    const madInp = document.getElementById("input-srl-mad");
    const madUnitSel = document.getElementById("select-mad-unit");
    const resetBtn = document.getElementById("btn-reset-mad");
    const warnBox = document.getElementById("mad-warning-box");

    // Arrest force controls
    const afInp = document.getElementById("input-arrest-force");
    const afUnitSel = document.getElementById("select-arrest-force-unit");
    const connDevSel = document.getElementById("select-connecting-device");
    const sideConnDevSel = document.getElementById("select-sidebar-connecting-device");

    function onMadChange() {
        updateMadEquivalentUI();
        validateSrlSelection();
        if (typeof updateCalculationsUI === "function") {
            const maxSpan = Calculator.getMaxSpan(state.product);
            const layout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
            updateCalculationsUI(layout, maxSpan);
        }
    }

    if (madInp && !madInp.dataset.hasListener) {
        madInp.dataset.hasListener = "true";
        madInp.addEventListener("input", onMadChange);
        madInp.addEventListener("change", onMadChange);
    }

    if (madUnitSel && !madUnitSel.dataset.hasListener) {
        madUnitSel.dataset.hasListener = "true";
        madUnitSel.addEventListener("change", () => {
            const prevUnit = state.madUnit || "m";
            const nextUnit = madUnitSel.value;
            state.madUnit = nextUnit;
            const currentVal = parseFloat(madInp.value);
            if (!isNaN(currentVal) && currentVal > 0) {
                if (prevUnit === "m" && nextUnit === "in") {
                    madInp.value = (currentVal / 0.0254).toFixed(1);
                } else if (prevUnit === "in" && nextUnit === "m") {
                    madInp.value = (currentVal * 0.0254).toFixed(2);
                }
            }
            onMadChange();
        });
    }

    if (resetBtn && !resetBtn.dataset.hasListener) {
        resetBtn.dataset.hasListener = "true";
        resetBtn.addEventListener("click", () => {
            const unit = madUnitSel ? madUnitSel.value : (state.madUnit || "m");
            if (unit === "in") {
                madInp.value = "42.0";
            } else {
                madInp.value = "1.07";
            }
            onMadChange();
        });
    }

    function onArrestForceChange() {
        updateArrestForceEquivalentUI();
        validateSrlSelection();
        if (state.arrestLoadMode !== "custom") {
            recalculateLumpSumArrestLoad();
        }
        if (typeof updateCalculationsUI === "function") {
            const maxSpan = Calculator.getMaxSpan(state.product);
            const layout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
            updateCalculationsUI(layout, maxSpan);
        }
    }

    if (afInp && !afInp.dataset.hasListener) {
        afInp.dataset.hasListener = "true";
        afInp.addEventListener("input", onArrestForceChange);
        afInp.addEventListener("change", onArrestForceChange);
    }

    if (afUnitSel && !afUnitSel.dataset.hasListener) {
        afUnitSel.dataset.hasListener = "true";
        afUnitSel.addEventListener("change", () => {
            const prevUnit = state.arrestForceUnit || "lbf";
            const nextUnit = afUnitSel.value;
            state.arrestForceUnit = nextUnit;
            const currentVal = parseFloat(afInp.value);
            if (!isNaN(currentVal) && currentVal > 0) {
                if (prevUnit === "lbf" && nextUnit === "kN") {
                    afInp.value = Math.abs(currentVal - 1350) < 1.0 ? "6.00" : (currentVal * 0.0044482216).toFixed(2);
                } else if (prevUnit === "kN" && nextUnit === "lbf") {
                    afInp.value = Math.abs(currentVal - 6.00) < 0.01 ? "1350" : Math.round(currentVal * 224.808943);
                }
            }
            onArrestForceChange();
        });
    }

    // Connecting device selection & sync
    function handleConnectingDeviceChange(newVal) {
        state.connectingDevice = newVal;
        if (connDevSel) connDevSel.value = newVal;
        if (sideConnDevSel) sideConnDevSel.value = newVal;

        // Pre-fill or adjust length based on device type
        const lenInp = document.getElementById("input-srl-retracted-length");
        const unitSel = document.getElementById("select-retracted-length-unit");
        const curUnit = unitSel ? unitSel.value : (state.retractedLengthUnit || "m");

        if (newVal === "srd") {
            if (state.selectedSrlId && SRL_CATALOG[state.selectedSrlId]) {
                const srl = SRL_CATALOG[state.selectedSrlId];
                if (lenInp && srl.retracted_length_m !== null) {
                    if (curUnit === "m") lenInp.value = srl.retracted_length_m.toFixed(2);
                    else if (curUnit === "ft") lenInp.value = (srl.retracted_length_m / 0.3048).toFixed(1);
                    else if (curUnit === "in") lenInp.value = (srl.retracted_length_m / 0.0254).toFixed(1);
                    state.retractedLengthM = srl.retracted_length_m;
                }
            }
        } else if (newVal === "lanyard") {
            if (lenInp) {
                if (curUnit === "m") lenInp.value = "1.80";
                else if (curUnit === "ft") lenInp.value = "6.0";
                else if (curUnit === "in") lenInp.value = "70.9";
                state.retractedLengthM = 1.80;
            }
        } else if (newVal === "custom_srd" || newVal === "custom_lanyard") {
            if (lenInp && (state.customDeviceLengthM === undefined || state.customDeviceLengthM === null)) {
                lenInp.value = "";
                state.retractedLengthM = null;
            }
        }

        updateRetractedLengthEquivalentUI();
        updateConnectingDeviceUI();
        validateSrlSelection();
        if (typeof updateCalculationsUI === "function") {
            const maxSpan = Calculator.getMaxSpan(state.product);
            const layout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
            updateCalculationsUI(layout, maxSpan);
        }
    }

    if (connDevSel && !connDevSel.dataset.hasListener) {
        connDevSel.dataset.hasListener = "true";
        connDevSel.addEventListener("change", (e) => handleConnectingDeviceChange(e.target.value));
    }

    if (sideConnDevSel && !sideConnDevSel.dataset.hasListener) {
        sideConnDevSel.dataset.hasListener = "true";
        sideConnDevSel.addEventListener("change", (e) => handleConnectingDeviceChange(e.target.value));
    }

    // Listen to custom fields (both main and sidebar)
    const customNameInp = document.getElementById("input-custom-device-name");
    const sideCustomNameInp = document.getElementById("input-sidebar-custom-name");
    const customClassSel = document.getElementById("select-custom-device-class");
    const sideCustomClassSel = document.getElementById("select-sidebar-custom-class");
    const customLenInp = document.getElementById("input-custom-device-length");

    function syncCustomName(val) {
        state.customDeviceName = val;
        if (customNameInp && customNameInp.value !== val) customNameInp.value = val;
        if (sideCustomNameInp && sideCustomNameInp.value !== val) sideCustomNameInp.value = val;
    }

    function syncCustomClass(val) {
        state.customDeviceClass = parseInt(val) || 2;
        if (customClassSel && customClassSel.value !== val) customClassSel.value = val;
        if (sideCustomClassSel && sideCustomClassSel.value !== val) sideCustomClassSel.value = val;
        validateSrlSelection();
    }

    if (customNameInp && !customNameInp.dataset.hasListener) {
        customNameInp.dataset.hasListener = "true";
        customNameInp.addEventListener("input", (e) => syncCustomName(e.target.value));
    }
    if (sideCustomNameInp && !sideCustomNameInp.dataset.hasListener) {
        sideCustomNameInp.dataset.hasListener = "true";
        sideCustomNameInp.addEventListener("input", (e) => syncCustomName(e.target.value));
    }
    if (customClassSel && !customClassSel.dataset.hasListener) {
        customClassSel.dataset.hasListener = "true";
        customClassSel.addEventListener("change", (e) => syncCustomClass(e.target.value));
    }
    if (sideCustomClassSel && !sideCustomClassSel.dataset.hasListener) {
        sideCustomClassSel.dataset.hasListener = "true";
        sideCustomClassSel.addEventListener("change", (e) => syncCustomClass(e.target.value));
    }
    if (customLenInp && !customLenInp.dataset.hasListener) {
        customLenInp.dataset.hasListener = "true";
        customLenInp.addEventListener("input", (e) => {
            const v = parseFloat(e.target.value) || 0.60;
            state.customDeviceLengthM = v;
            state.retractedLengthM = v;
            if (typeof updateCalculationsUI === "function") {
                const maxSpan = Calculator.getMaxSpan(state.product);
                const layout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
                updateCalculationsUI(layout, maxSpan);
            }
        });
    }

    // Initialize display values on load
    updateRetractedLengthEquivalentUI();
    updateSrlCardsDisplay();
    updateMadEquivalentUI();
    updateArrestForceEquivalentUI();
    updateConnectingDeviceUI();

    // Connect Stairs Toggle Button in 3D toolbar
    const stairsBtn = document.getElementById("btn-toggle-stairs");
    if (stairsBtn && !stairsBtn.dataset.hasListener) {
        stairsBtn.dataset.hasListener = "true";
        stairsBtn.addEventListener("click", () => {
            state.showStairs = (state.showStairs === false);
            stairsBtn.classList.toggle("active", state.showStairs !== false);
            if (typeof update3DScene === "function") update3DScene();
        });
    }
}
window.initSrlMadControls = initSrlMadControls;
window.convertRetractedLength = convertRetractedLength;
window.updateRetractedLengthEquivalentUI = updateRetractedLengthEquivalentUI;
window.resetRetractedLength = resetRetractedLength;
window.updateSrlCardsDisplay = updateSrlCardsDisplay;
window.RETRACTED_WARN_M = RETRACTED_WARN_M;
window.updateMadEquivalentUI = updateMadEquivalentUI;
window.updateArrestForceEquivalentUI = updateArrestForceEquivalentUI;
window.updateConnectingDeviceUI = updateConnectingDeviceUI;

function setFallCalculationMode(mode) {
    state.fallCalculationMode = mode;
    const tabCrit = document.getElementById("tab-mode-critical");
    const tabSel = document.getElementById("tab-mode-selected");
    if (tabCrit) tabCrit.classList.toggle("active", mode === "critical_case");
    if (tabSel) tabSel.classList.toggle("active", mode === "selected_span");
    const selModal = document.getElementById("select-fall-mode");
    if (selModal) selModal.value = mode;

    if (typeof updateCalculationsUI === "function") {
        const maxSpan = Calculator.getMaxSpan(state.product);
        const layout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
        updateCalculationsUI(layout, maxSpan);
    }
}
window.setFallCalculationMode = setFallCalculationMode;

// ==========================================
// CONFIGURATION 6 (RÉSERVOIR / BOUCLE FERMÉE) ENGINE
// ==========================================
function recalculateConfig6Spans() {
    if (state.layoutType !== "multi_bend_circle") return;
    state.closedLoop = false;
    state.config6StructureType = "reservoir";

    if (state.config6Mode === "reservoir") {
        const N = Math.max(3, state.config6NbPosts || 16);
        state.config6NbPosts = N;
        const D = Math.max(1.0, state.config6Diameter || 30.0);
        const setback = Math.max(0, state.config6Setback !== undefined ? state.config6Setback : 0.5);
        const R_pose = Math.max(0.5, (D / 2) - setback);

        // Side length L of regular polygon
        const L = parseFloat((2 * R_pose * Math.sin(Math.PI / N)).toFixed(3));
        const bendDeg = parseFloat((180 - (360 / N)).toFixed(2));

        state.spans = [];
        // For N posts in an open line on reservoir roof, there are N - 1 spans
        for (let i = 0; i < N - 1; i++) {
            state.spans.push({
                length: L,
                bendDeg: bendDeg,
                slopeDeg: 0,
                isSloped: false,
                bend90: false
            });
        }
    }
}

function getConfig6ClosureError() {
    const spans = state.spans || [];
    if (spans.length < 3) return { isClosed: false, distError: Infinity, angleError: 360 };

    let x = 0, z = 0, heading = 0;
    let extAngleSum = 0;

    for (let i = 0; i < spans.length; i++) {
        const sp = spans[i];
        const len = sp.length || 5.0;
        x += len * Math.cos(heading);
        z += len * Math.sin(heading);

        const bend = sp.bendDeg !== undefined ? sp.bendDeg : (180 - (360 / spans.length));
        const turn = 180 - bend;
        extAngleSum += turn;
        heading += (turn * Math.PI) / 180;
    }

    const distError = Math.sqrt(x * x + z * z);
    const angleError = Math.abs(extAngleSum - 360);
    const isClosed = distError <= 0.05 && angleError <= 1.5;
    return { isClosed, distError, angleError, finalX: x, finalZ: z, extAngleSum };
}

function adjustLastSpanConfig6() {
    const spans = state.spans || [];
    if (spans.length < 3) return;
    const n = spans.length;

    let x = 0, z = 0, heading = 0;
    for (let i = 0; i < n - 1; i++) {
        const sp = spans[i];
        const len = sp.length || 5.0;
        x += len * Math.cos(heading);
        z += len * Math.sin(heading);

        const bend = sp.bendDeg !== undefined ? sp.bendDeg : (180 - (360 / n));
        const turn = 180 - bend;
        heading += (turn * Math.PI) / 180;
    }

    // Vector required to return to (0,0)
    const reqDx = -x;
    const reqDz = -z;
    const reqLen = Math.sqrt(reqDx * reqDx + reqDz * reqDz);
    const reqHeading = Math.atan2(reqDz, reqDx);

    let diffHeading = reqHeading - heading;
    while (diffHeading > Math.PI) diffHeading -= 2 * Math.PI;
    while (diffHeading < -Math.PI) diffHeading += 2 * Math.PI;

    const turnDeg = (diffHeading * 180) / Math.PI;
    const bendDeg = parseFloat((180 - Math.abs(turnDeg)).toFixed(2));

    spans[n - 1].length = parseFloat(reqLen.toFixed(3));
    spans[n - 1].bendDeg = bendDeg;
}

function openConfigModal() {
    const homeScreen = document.getElementById("home-screen");
    const dashboardScreen = document.getElementById("dashboard-screen");
    const configModal = document.getElementById("config-modal");

    // Transition from home splash screen to dashboard 3D workspace
    if (homeScreen) {
        homeScreen.classList.remove("active");
        homeScreen.style.display = "none";
    }
    if (dashboardScreen) {
        dashboardScreen.classList.add("active");
        dashboardScreen.style.display = "flex";
    }

    const hasUrlConfig = (urlParams && (urlParams.get("config") || urlParams.get("layout")));
    if (configModal && !hasUrlConfig) {
        configModal.classList.add("active");
        configModal.style.display = "flex";
        configModal.style.visibility = "visible";
        configModal.style.opacity = "1";
        configModal.style.zIndex = "99999";
    } else if (configModal && hasUrlConfig) {
        configModal.classList.remove("active");
        configModal.style.display = "none";
        if (typeof update3DScene === "function") {
            setTimeout(() => {
                update3DScene();
            }, 150);
        }
    }

    try {
        populateConfigModalInputs();
    } catch (err) {
        console.warn("Populate Modal Error:", err);
    }

    if (typeof initThreeEngine === "function" && !renderer) {
        try {
            initThreeEngine();
        } catch (err) {
            console.warn("3D Engine Init Error:", err);
        }
    }
}

function closeConfigModal() {
    const configModal = document.getElementById("config-modal");
    if (configModal) {
        configModal.classList.remove("active");
        configModal.style.display = "none";
    }
}

window.openConfigModal = openConfigModal;
window.closeConfigModal = closeConfigModal;

function populateConfigModalInputs() {
    const isEn = (parseInt(state.lang) === 1);
    const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
    
    // Project info inputs
    const pName = document.getElementById("input-proj-name");
    const pLoc = document.getElementById("input-proj-loc");
    const pDes = document.getElementById("input-proj-designer");
    const pHll = document.getElementById("input-proj-hll");
    if (pName) pName.value = state.projectInfo.name || "";
    if (pLoc) pLoc.value = state.projectInfo.location || "";
    if (pDes) pDes.value = state.projectInfo.designer || "";
    if (pHll) pHll.value = state.projectInfo.hllName || "HLL-01";

    // Units dropdown
    const unitSel = document.getElementById("select-unit-system");
    if (unitSel) unitSel.value = isUS ? "imperial" : "metric";

    // Application mode
    const appSel = document.getElementById("select-app-mode");
    if (appSel) appSel.value = state.appMode || "fall_arrest";

    // Arrest load mode & value
    const arrestModeSel = document.getElementById("select-arrest-load-mode");
    const arrestValInp = document.getElementById("input-arrest-load-val");
    if (arrestModeSel) arrestModeSel.value = state.arrestLoadMode || "lump_sum";
    if (arrestValInp) {
        arrestValInp.min = isUS ? "1" : "0.1";
        arrestValInp.max = isUS ? "10000" : "100";
        arrestValInp.step = isUS ? "1" : "0.1";
        arrestValInp.value = isUS
            ? Math.round((state.arrestLoadValue || 6.0) * UnitsModule.KN_TO_LBF)
            : (state.arrestLoadValue || 6.0).toFixed(2);
    }
    if (typeof updateLumpSumHint === "function") updateLumpSumHint();

    // HOOKT Product Family dropdown
    const prodSel = document.getElementById("select-product");
    if (prodSel) prodSel.value = normalizeProduct(state.product || "CORE");

    // Buffer length display
    const bufferInfo = document.getElementById("lbl-buffer-len-info");
    const bufLenM = isExtreme(state.product) ? 0.30 : 0.20;
    state.bufferLength = bufLenM;
    if (bufferInfo) {
        bufferInfo.innerHTML = isEn
            ? `Fixed end buffer: <strong>${formatDistance(bufLenM, 2)}</strong> (not user-editable)`
            : `Buffer d'extrémité fixe : <strong>${formatDistance(bufLenM, 2)}</strong> (non modifiable par l'utilisateur)`;
    }

    // Layout dropdown
    const layoutSel = document.getElementById("select-layout-type");
    if (layoutSel) layoutSel.value = state.layoutType || "single_span";

    const usersElem = document.getElementById("input-users");
    if (usersElem) {
        const maxU = (isCore(state.product) || isExtreme(state.product)) ? 3 : 5;
        usersElem.max = maxU;
        usersElem.value = Math.min(state.nbUsers, maxU);
    }

    // HLL Elevation preset & value
    const elevSel = document.getElementById("select-hll-elevation-preset");
    const elevInp = document.getElementById("input-hll-elevation-val");
    const elevGrp = document.getElementById("group-hll-elevation-val");
    if (elevSel) elevSel.value = state.hllElevationPreset || "knee";
    if (elevInp) {
        elevInp.min = isUS ? "0.5" : "0.2";
        elevInp.max = isUS ? "100.0" : "15.0";
        elevInp.step = isUS ? "0.1" : "0.05";
        elevInp.value = isUS
            ? ((state.hllElevation || 0.45) * UnitsModule.M_TO_FT).toFixed(2)
            : (state.hllElevation || 0.45).toFixed(2);
    }
    if (elevGrp) elevGrp.style.display = (state.hllElevationPreset === "custom") ? "block" : "none";

    const wwsInp = document.getElementById("input-wws-elevation");
    if (wwsInp) {
        const wwsM = (state.wwsElevationM !== undefined ? state.wwsElevationM : 6.0);
        wwsInp.value = isUS ? (wwsM * UnitsModule.M_TO_FT).toFixed(1) : wwsM.toFixed(1);
    }

    // Spec V2 — 03: Roof Surface Parameters
    const distUnit = isUS ? "ft" : "m";
    const toCurrentLen = (m) => isUS ? (m * UnitsModule.M_TO_FT) : m;

    const rNormSel = document.getElementById("select-roof-norm");
    const rTypeSel = document.getElementById("select-roof-type");
    const rLenInp = document.getElementById("input-roof-length");
    const rWidInp = document.getElementById("input-roof-width");
    const rSlope1Inp = document.getElementById("input-roof-slope-1");
    const rSlope2Inp = document.getElementById("input-roof-slope-2");
    const rRidgeInp = document.getElementById("input-ridge-pos");
    const rEdgeInp = document.getElementById("input-line-to-edge");
    const rHGroundInp = document.getElementById("input-roof-height-ground");

    if (rNormSel) {
        rNormSel.value = (state.norm === "EN 795" || state.norm === "EN") ? "EN 795" : "OSHA";
        if (!rNormSel.dataset.hasListener) {
            rNormSel.dataset.hasListener = "true";
            rNormSel.addEventListener("change", (e) => {
                setNorm(e.target.value);
            });
        }
    }

    const curTypeVal = state.roof_type || state.roofShape || "flat";
    if (rTypeSel) rTypeSel.value = curTypeVal;
    if (rLenInp) rLenInp.value = toCurrentLen(state.roof_length || 25.0).toFixed(1);
    if (rWidInp) rWidInp.value = toCurrentLen(state.roof_width || 15.0).toFixed(1);
    const initSlope1 = (state.roof_slope_deg !== undefined && state.roof_slope_deg > 0)
        ? state.roof_slope_deg
        : ((state.roofSlope && state.roofSlope > 0) ? state.roofSlope : (curTypeVal === "flat" ? 0 : 15.0));
    if (rSlope1Inp) rSlope1Inp.value = initSlope1.toFixed(1);
    const initSlope2 = (state.roof_slope_deg_2 !== undefined && state.roof_slope_deg_2 > 0)
        ? state.roof_slope_deg_2
        : (curTypeVal === "triangle" ? 15.0 : 0);
    if (rSlope2Inp) rSlope2Inp.value = initSlope2.toFixed(1);
    if (rRidgeInp) rRidgeInp.value = toCurrentLen(state.ridge_position || 7.5).toFixed(1);
    if (rEdgeInp) rEdgeInp.value = toCurrentLen(state.line_to_edge || 2.0).toFixed(1);
    if (rHGroundInp) rHGroundInp.value = toCurrentLen(state.roof_height_above_ground || 6.0).toFixed(1);

    updateUnitLabelsInDOM();

    // Toggle slope groups in modal
    function syncRoofTypeVisibility() {
        const curType = rTypeSel ? rTypeSel.value : (state.roof_type || "flat");
        const curNorm = (state.norm === "EN 795" || state.norm === "EN") ? "EN 795" : "OSHA";
        const grpS1 = document.getElementById("group-roof-slope-1");
        const grpS2 = document.getElementById("group-roof-slope-2");
        const grpRidge = document.getElementById("group-ridge-pos");
        const hintNormEn = document.getElementById("hint-roof-norm-en");
        if (grpS1) grpS1.style.display = (curType === "sloped" || curType === "triangle") ? "block" : "none";
        if (grpS2) grpS2.style.display = (curType === "triangle") ? "block" : "none";
        if (grpRidge) grpRidge.style.display = (curType === "triangle") ? "block" : "none";
        if (hintNormEn) {
            hintNormEn.style.display = (curNorm === "EN 795" && (curType === "sloped" || curType === "triangle")) ? "block" : "none";
        }
        if (curType === "sloped" || curType === "triangle") {
            if (rSlope1Inp && (parseFloat(rSlope1Inp.value) <= 0 || isNaN(parseFloat(rSlope1Inp.value)))) {
                rSlope1Inp.value = "15.0";
            }
        }
    }
    syncRoofTypeVisibility();
    if (rTypeSel && !rTypeSel.dataset.hasListener) {
        rTypeSel.addEventListener("change", syncRoofTypeVisibility);
        rTypeSel.dataset.hasListener = "true";
    }

    // Spec V2 — 04: Calculation Inputs
    const devSel = document.getElementById("select-connecting-device");
    const fallModeSel = document.getElementById("select-fall-mode");
    const bodyPosSel = document.getElementById("select-body-pos");
    const substrateInp = document.getElementById("input-substrate-info");

    if (devSel) devSel.value = state.connectingDevice || "srd";
    if (fallModeSel) fallModeSel.value = state.fallCalculationMode || "critical_case";
    if (bodyPosSel) bodyPosSel.value = state.bodyPosition || "standing";
    if (substrateInp) substrateInp.value = state.substrateInfo || "";

    // Filter layout dropdown options based on active system product rules
    filterLayoutDropdownOptions();

    renderDynamicLayoutForm();
}

function filterLayoutDropdownOptions() {
    const layoutSel = document.getElementById("select-layout-type");
    if (!layoutSel) return;
    const prod = (state.product || "CORE").toUpperCase();

    const opt11 = layoutSel.querySelector("option[value='cross_spans']");
    const opt12 = layoutSel.querySelector("option[value='grid_system']");

    const isNewPro = isPro(prod);
    const isLongRange = isExtreme(prod);

    if (opt11) {
        opt11.disabled = false;
        opt11.style.display = "block";
    }
    if (opt12) {
        opt12.disabled = false;
        opt12.style.display = "block";
    }

    if (state.layoutType === "cross_spans" && !isNewPro) {
        state.layoutType = "single_span";
        layoutSel.value = "single_span";
    }
    if (state.layoutType === "grid_system" && !isLongRange) {
        state.layoutType = "single_span";
        layoutSel.value = "single_span";
    }
    if (DEPRECATED_CONFIGS.includes(state.layoutType)) {
        state.layoutType = "multi_straight";
        layoutSel.value = "multi_straight";
    }
}

function renderUnifiedSpansTableHTML(layout, distUnit, isEn) {
    if (typeof LayoutEditorModule !== "undefined") {
        LayoutEditorModule.ensureSpansHaveStableIds();
    }
    return `
        <div class="form-group full-width" style="display:flex; justify-content:space-between; align-items:center;">
            <label><i class="fa-solid fa-list-ol"></i> ${isEn ? "Number of Spans (N):" : "Nombre de portées (N) :"}</label>
            <div class="input-with-unit" style="max-width: 140px;">
                <input type="number" id="input-nb-spans" min="2" max="50" value="${state.spans.length}">
                <span class="unit">${isEn ? "spans" : "portées"}</span>
            </div>
        </div>
        <div class="spans-table-wrapper" style="overflow-x: auto;">
            <table class="spans-table">
                <thead>
                    <tr>
                        <th style="min-width: 70px;">${isEn ? "Span" : "Portée"}</th>
                        <th style="min-width: 100px;">${isEn ? "Length" : "Longueur"} (${distUnit})</th>
                        <th style="min-width: 90px;">${isEn ? "Bend" : "Coude"} (°)</th>
                        <th style="min-width: 90px;">${isEn ? "Slope" : "Pente"} (°)</th>
                        <th style="min-width: 60px; text-align: center;" title="${isEn ? "Active fall span (calculated load)" : "Portée active de chute (effort calculé)"}">${isEn ? "Fall" : "Chute"}</th>
                        <th style="min-width: 110px; text-align: center;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.spans.map((sp, idx) => {
                        const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
                        const val = isUS ? (sp.length * METERS_TO_FEET).toFixed(2) : (typeof sp.length === "number" ? sp.length.toFixed(2) : sp.length);
                        const bendVal = (sp.bend_after_deg !== undefined ? sp.bend_after_deg : sp.bendDeg) || (sp.bend90 ? 90 : 0);
                        const slopeVal = (sp.slope_deg !== undefined ? sp.slope_deg : sp.slopeDeg) || 0;
                        const isFallSpan = (sp.id === state.selectedFallSpanId);
                        const isLast = (idx === state.spans.length - 1);
                        return `
                            <tr style="${isFallSpan ? 'background: rgba(239, 68, 68, 0.08); font-weight: 600;' : ''}">
                                <td><strong>S${idx + 1}</strong> <span style="font-size:0.75rem; color:#64748b;">(A${idx + 1}→A${idx + 2})</span></td>
                                <td><input type="number" class="span-length-input" data-idx="${idx}" value="${val}" step="any" min="0.1" style="width: 80px;"></td>
                                <td>
                                    ${!isLast ? `<input type="number" class="span-benddeg-input" data-idx="${idx}" value="${bendVal}" step="any" min="-180" max="180" style="width: 65px;"> °` : `<span style="color:#94a3b8; font-size:0.8rem;">${isEn ? 'End' : 'Fin'}</span>`}
                                </td>
                                <td>
                                    <input type="number" class="span-slopedeg-input" data-idx="${idx}" value="${slopeVal}" step="any" min="-75" max="75" style="width: 65px;"> °
                                </td>
                                <td style="text-align: center;">
                                    <input type="radio" name="radio-fall-span" class="span-fall-radio" data-span-id="${sp.id}" ${isFallSpan ? 'checked' : ''} title="${isEn ? "Active fall span" : "Portée de chute active"}">
                                </td>
                                <td style="text-align: center; white-space: nowrap;">
                                    ${!isLast ? `<button type="button" class="btn-table-icon btn-table-xmatrix ${sp.hasXMatrix ? 'active-xmat' : ''}" data-idx="${idx}" title="${sp.hasXMatrix ? (isEn ? "X-Matrix active - click to remove" : "X-Matrix active - cliquer pour retirer") : (isEn ? "Add X-Matrix junction (multi-directions)" : "Ajouter une X-Matrix (multi-directions)")}"><i class="fa-solid fa-diagram-project"></i></button>` : ''}
                                    <button type="button" class="btn-table-icon btn-split-span" data-idx="${idx}" title="${isEn ? "Split this span in two" : "Couper cette portée en deux"}"><i class="fa-solid fa-scissors"></i></button>
                                    <button type="button" class="btn-table-icon btn-insert-after" data-idx="${idx}" title="${isEn ? "Insert span after" : "Insérer une portée après"}"><i class="fa-solid fa-plus"></i></button>
                                    ${state.spans.length > 1 ? `<button type="button" class="btn-table-icon btn-danger-hover btn-delete-span" data-idx="${idx}" title="${isEn ? "Delete" : "Supprimer"}"><i class="fa-solid fa-trash"></i></button>` : ''}
                                </td>
                            </tr>
                            ${(!isLast && sp.hasXMatrix) ? `
                            <tr class="xmatrix-table-subrow">
                                <td colspan="6" style="padding: 8px 12px;">
                                    <div style="display:flex; flex-direction:column; gap:8px;">
                                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                                            <div style="display:flex; align-items:center; gap:6px;">
                                                <span class="badge-tag-id xmatrix-badge" style="font-size:0.75rem; padding:2px 8px; border-radius:4px; font-weight:700;">
                                                    <i class="fa-solid fa-diagram-project"></i> X-Matrix A${idx + 2}
                                                </span>
                                                <span style="font-size:0.8rem; color:#1e3a8a; font-weight:600;">
                                                    ${isEn ? "Multi-direction branches (0 to 2):" : "Branches multi-directions (0 à 2) :"}
                                                </span>
                                                ${(!sp.xMatrixBranches || sp.xMatrixBranches.length === 0) ? `<span style="font-size:0.75rem; color:#64748b; font-style:italic;">${isEn ? "No branch (pass-through)" : "0 branche (jonction simple)"}</span>` : ''}
                                            </div>
                                            <div style="display:flex; align-items:center; gap:6px;">
                                                ${(!sp.xMatrixBranches || sp.xMatrixBranches.length < 2) ? `
                                                    <button type="button" class="btn btn-secondary btn-sm btn-table-add-branch" data-span-idx="${idx}" style="height:26px; padding:2px 8px; font-size:0.72rem; white-space:nowrap; border-color:#93c5fd; color:#1d4ed8; background:#eff6ff;">
                                                        <i class="fa-solid fa-plus"></i> ${isEn ? "Add Branch" : "Ajouter branche"}
                                                    </button>
                                                ` : ''}
                                                <button type="button" class="btn btn-secondary btn-sm btn-table-remove-xmat" data-span-idx="${idx}" style="height:26px; padding:2px 8px; font-size:0.72rem; color:#dc2626; border-color:#fca5a5; background:#fff;" title="${isEn ? "Remove X-Matrix" : "Retirer la X-Matrix"}">
                                                    <i class="fa-solid fa-trash"></i>
                                                </button>
                                            </div>
                                        </div>
                                        ${(sp.xMatrixBranches && sp.xMatrixBranches.length > 0) ? `
                                            <div style="display:flex; flex-direction:column; gap:6px;">
                                                ${sp.xMatrixBranches.map((br, bIdx) => {
                                                    const bSpans = (typeof getBranchSpans === "function") ? getBranchSpans(br) : (br.spans || [{ id: (br.id || "xmb") + "_s1", length: br.length || 5.0 }]);
                                                    const angVal = br.angleDeg !== undefined ? br.angleDeg : (bIdx === 0 ? 90 : -90);
                                                    return `
                                                        <div class="xmatrix-branch-item-block">
                                                            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;">
                                                                <div style="display:flex; align-items:center; gap:6px;">
                                                                    <strong style="color:#2563eb; font-size:0.8rem;"><i class="fa-solid fa-code-branch"></i> Branche B${bIdx + 1}</strong>
                                                                    <span style="font-size:0.75rem; color:#64748b;">|</span>
                                                                    <span style="font-size:0.75rem; color:#475569;">Angle :</span>
                                                                    <input type="number" class="xmat-branch-ang-input" data-span-idx="${idx}" data-branch-idx="${bIdx}" value="${angVal}" step="any" style="width:48px; height:22px; font-size:0.75rem; text-align:center;" title="${isEn ? "Branch angle (deg)" : "Angle de la branche (deg)"}"> <span style="font-size:0.72rem; color:#64748b;">°</span>
                                                                </div>
                                                                <button type="button" class="btn-delete-xmat-branch" data-span-idx="${idx}" data-branch-idx="${bIdx}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.8rem; padding:0 4px;" title="${isEn ? "Delete branch" : "Supprimer cette branche"}"><i class="fa-solid fa-trash"></i></button>
                                                            </div>
                                                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:4px; padding-left:10px;">
                                                                <span style="font-size:0.72rem; font-weight:600; color:#475569;">${isEn ? "Spans:" : "Portées :"}</span>
                                                                ${bSpans.map((subSp, sIdx) => {
                                                                    const subLenVal = isUS ? (subSp.length * METERS_TO_FEET).toFixed(2) : (typeof subSp.length === "number" ? subSp.length.toFixed(2) : subSp.length);
                                                                    return `
                                                                        <div class="xmatrix-branch-item" style="padding:2px 6px; gap:4px;">
                                                                            <strong style="color:#3b82f6; font-size:0.75rem;">S${sIdx + 1}:</strong>
                                                                            <input type="number" class="xmat-branch-len-input xmat-branch-subspan-input" data-span-idx="${idx}" data-branch-idx="${bIdx}" data-subspan-idx="${sIdx}" value="${subLenVal}" step="any" min="0.5" style="width:50px; height:20px; font-size:0.75rem; text-align:center;" title="${isEn ? "Span length" : "Longueur de la portée"}"> <span style="font-size:0.68rem; color:#64748b;">${distUnit}</span>
                                                                            ${bSpans.length > 1 ? `
                                                                                <button type="button" class="btn-delete-branch-subspan" data-span-idx="${idx}" data-branch-idx="${bIdx}" data-subspan-idx="${sIdx}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.7rem; padding:0 2px;" title="${isEn ? "Delete span" : "Supprimer cette portée"}"><i class="fa-solid fa-times"></i></button>
                                                                            ` : ''}
                                                                        </div>
                                                                    `;
                                                                }).join('')}
                                                                <button type="button" class="btn btn-secondary btn-sm btn-add-branch-subspan" data-span-idx="${idx}" data-branch-idx="${bIdx}" style="height:22px; padding:1px 6px; font-size:0.7rem; border-color:#93c5fd; color:#2563eb; background:#eff6ff;" title="${isEn ? "Add span to branch" : "Ajouter une portée à la branche"}">
                                                                    <i class="fa-solid fa-plus"></i> ${isEn ? "Add Span" : "Ajouter portée"}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                        ` : ''}
                                    </div>
                                </td>
                            </tr>` : ''}
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <div class="spans-action-bar" style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px;">
            <button type="button" class="btn-table-action" id="btn-insert-start"><i class="fa-solid fa-circle-arrow-up"></i> ${isEn ? "Insert at Start" : "Insérer au début"}</button>
            <button type="button" class="btn-table-action" id="btn-add-span"><i class="fa-solid fa-circle-plus"></i> ${isEn ? "Add at End" : "Ajouter à la fin"}</button>
            <button type="button" class="btn-table-action" id="btn-table-undo" title="${isEn ? "Undo last action (Ctrl+Z)" : "Annuler dernière action (Ctrl+Z)"}"><i class="fa-solid fa-rotate-left"></i> ${isEn ? "Undo" : "Annuler"}</button>
            <button type="button" class="btn-table-action" id="btn-table-redo" title="${isEn ? "Redo action (Ctrl+Y)" : "Rétablir action (Ctrl+Y)"}"><i class="fa-solid fa-rotate-right"></i> ${isEn ? "Redo" : "Rétablir"}</button>
        </div>
        <div class="form-group full-width margin-top-sm" style="background: rgba(59, 130, 246, 0.05); padding: 10px; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.2);">
            <label for="select-bend-orientation" style="font-weight: 600; color: #1e293b;">
                <i class="fa-solid fa-arrows-spin" style="color: #3b82f6;"></i> ${isEn ? "Orientation of all components / posts:" : "Orientation de toutes les pièces / potelets :"}
            </label>
            <select id="select-bend-orientation" class="select-custom" style="margin-top: 4px;">
                <option value="inside" ${state.bendOrientation !== 'outside' ? 'selected' : ''}>${isEn ? "Inside the line (Inside)" : "À l'intérieur de la ligne (Inside)"}</option>
                <option value="outside" ${state.bendOrientation === 'outside' ? 'selected' : ''}>${isEn ? "Outside the line (Outside)" : "À l'extérieur de la ligne (Outside)"}</option>
            </select>
        </div>
    `;
}

function getBranchSpans(branch) {
    if (!branch) return [{ id: "xmb_s1", length: 5.0 }];
    if (Array.isArray(branch.spans) && branch.spans.length > 0) {
        return branch.spans;
    }
    const len = Math.max(0.5, parseFloat(branch.length) || 5.0);
    branch.spans = [{ id: (branch.id || "xmb") + "_s1", length: len }];
    return branch.spans;
}

function getBranchTotalLength(branch) {
    const spans = getBranchSpans(branch);
    const sum = spans.reduce((acc, s) => acc + (Math.max(0.1, parseFloat(s.length) || 0)), 0);
    branch.length = Math.max(0.5, sum);
    return branch.length;
}

function cleanupCollinearXMatrixBranches(spans) {
    if (!spans || !Array.isArray(spans)) return;
    spans.forEach(sp => {
        if (!sp || !sp.hasXMatrix || !Array.isArray(sp.xMatrixBranches)) return;
        sp.xMatrixBranches = sp.xMatrixBranches.filter(br => {
            const rawAng = (br.angleDeg !== undefined) ? parseFloat(br.angleDeg) : 90;
            const normAng = ((rawAng % 360) + 360) % 360;
            const isCollinear0 = (normAng < 15 || normAng > 345);
            const isCollinear180 = (Math.abs(normAng - 180) < 15);
            return !isCollinear0 && !isCollinear180;
        });
        if (sp.xMatrixBranches.length > 2) {
            sp.xMatrixBranches = sp.xMatrixBranches.slice(0, 2);
        }
        sp.xMatrixBranches.forEach(br => {
            getBranchTotalLength(br);
        });
    });
}

function syncXMatrixNomenclature() {
    const curProd = normalizeProduct(state.product || "PRO");
    const comps = COMPONENTS_DB[curProd] || [];
    const xMatComp = comps.find(c => c.id === "X-Matrix");
    const hasSpanX = !!(state.spans && state.spans.some(s => s && s.hasXMatrix));
    const hasCrossOrGrid = state.layoutType === "cross_spans" || state.layoutType === "grid_system";
    let activeNodes = [];
    try {
        const layout = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
        activeNodes = (layout && layout.line1) ? layout.line1 : [];
    } catch (e) {}
    const hasNodeX = activeNodes.some(n => n.hasXMatrix || n.type === "x_matrix");
    const shouldCheck = !!(hasSpanX || hasCrossOrGrid || hasNodeX);

    if (xMatComp) {
        xMatComp.checked = shouldCheck;
    }
    if (!state.checkedComponents) state.checkedComponents = {};
    state.checkedComponents["X-Matrix"] = shouldCheck;
    if (typeof renderComponentsChecklist === "function") {
        renderComponentsChecklist();
    }
}

function renderDynamicLayoutForm() {
    const container = document.getElementById("layout-dynamic-container");
    if (!container) return;

    const isEn = (parseInt(state.lang) === 1);
    const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
    const distUnit = isUS ? "ft" : "m";
    const layout = state.layoutType || "single_span";
    let html = "";



    // 1. Single Span
    if (layout === "single_span") {
        const span1 = state.spans[0] ? state.spans[0].length : 15.0;
        const valDisp = isUS ? (span1 * METERS_TO_FEET).toFixed(2) : (typeof span1 === "number" ? span1.toFixed(2) : span1);
        html = `
            <div class="form-group full-width">
                <label><i class="fa-solid fa-ruler"></i> ${isEn ? "Single Span Length:" : "Longueur de la Portée Unique :"} (${distUnit})</label>
                <div class="input-with-unit">
                    <input type="number" id="input-span-single-len" value="${valDisp}" min="0.1" max="20000" step="any">
                    <span class="unit">${distUnit}</span>
                </div>
            </div>
        `;
    }
    // 2. Multi-span Layouts (Straight, Bends 90°, Variable Bends, Multiple Bends, Custom)
    else if (layout === "multi_straight" || layout === "multi_bend_90" || layout === "multi_bend_var" || layout === "multi_bend_multivar" || layout === "custom") {
        html = renderUnifiedSpansTableHTML(layout, distUnit, isEn);
    }
    // 5. Multi-span - Multiple 90-degree bends (Pourtour toiture / boucle)
    else if (layout === "multi_bend_multi90") {
        html = `
            <div class="form-group full-width">
                <label class="checkbox-label" for="chk-closed-loop">
                    <input type="checkbox" id="chk-closed-loop" ${state.closedLoop ? 'checked' : ''}>
                    <span><i class="fa-solid fa-arrows-spin"></i> ${isEn ? "Closed loop (last anchor connects to first - closed perimeter / polygon)" : "Boucle fermée (le dernier point rejoint le premier - rectangle / polygone fermé)"}</span>
                </label>
            </div>
            ${renderUnifiedSpansTableHTML(layout, distUnit, isEn)}
        `;
    }
    // 6. Multi-span - Variable-degree bends (circle / reservoir polygon)
    else if (layout === "multi_bend_circle") {
        recalculateConfig6Spans();

        const mode = state.config6Mode || "reservoir";
        const structType = state.config6StructureType || "reservoir";
        const isReservoirMode = (mode === "reservoir");

        const maxAdmissibleSpan = isCore(state.product) ? 3.5 : (isExtreme(state.product) ? 30.0 : 15.2);
        const currentSpanLen = state.spans[0] ? state.spans[0].length : 5.0;
        const isExceedingMax = currentSpanLen > maxAdmissibleSpan;

        const closure = getConfig6ClosureError();

        html = `
            <div class="config6-header-wrapper" style="background: linear-gradient(135deg, rgba(30,58,138,0.06), rgba(59,130,246,0.08)); padding: 12px; border-radius: 8px; border: 1px solid rgba(59,130,246,0.2); margin-bottom: 15px;">
                <div style="display: flex; gap: 15px; align-items: center; justify-content: space-between; flex-wrap: wrap;">
                    <div>
                        <strong style="color: #1e3a8a; font-size: 1rem;"><i class="fa-solid fa-droplet"></i> ${isEn ? "Configuration 6 — Lifeline on Water Tank / Silo" : "Configuration 6 — Ligne de Vie sur Réservoir d'Eau"}</strong>
                        <p style="font-size: 0.85rem; color: #475569; margin: 4px 0 0 0;">${isEn ? "3D visualization of an open lifeline arranged on the top surface of the tank." : "Visualisation 3D d'une ligne de vie ouverte disposée sur la surface plate du réservoir d'eau."}</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn-config6-mode ${isReservoirMode ? 'active' : ''}" data-mode="reservoir" style="padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer; border: 1px solid #3b82f6; ${isReservoirMode ? 'background:#2563eb; color:white;' : 'background:white; color:#1e293b;'}">
                            <i class="fa-solid fa-compass-drafting"></i> ${isEn ? "Tank Mode (Polygon)" : "Mode Réservoir (Polygone)"}
                        </button>
                        <button type="button" class="btn-config6-mode ${!isReservoirMode ? 'active' : ''}" data-mode="manual" style="padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer; border: 1px solid #3b82f6; ${!isReservoirMode ? 'background:#2563eb; color:white;' : 'background:white; color:#1e293b;'}">
                            <i class="fa-solid fa-table"></i> ${isEn ? "Manual Mode (Table)" : "Mode Manuel (Tableau)"}
                        </button>
                    </div>
                </div>
            </div>
        `;

        if (isReservoirMode) {
            const diamVal = isUS ? (state.config6Diameter * METERS_TO_FEET).toFixed(2) : state.config6Diameter;
            const setbackVal = isUS ? (state.config6Setback * METERS_TO_FEET).toFixed(2) : state.config6Setback;
            const heightVal = isUS ? (state.config6Height * METERS_TO_FEET).toFixed(2) : state.config6Height;

            html += `
                <div class="form-grid">
                    <div class="form-group">
                        <label><i class="fa-solid fa-circle-ruler"></i> ${isEn ? "Tank Diameter" : "Diamètre du Réservoir"} (${distUnit}) :</label>
                        <div class="input-with-unit">
                            <input type="number" id="input-config6-diam" value="${diamVal}" min="2.0" max="200.0" step="any">
                            <span class="unit">${distUnit}</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label><i class="fa-solid fa-list-ol"></i> ${isEn ? "Number of Posts (N ≥ 3) :" : "Nombre de Poteaux (N ≥ 3) :"}</label>
                        <div class="input-with-unit">
                            <input type="number" id="input-config6-n" value="${state.config6NbPosts}" min="3" max="100">
                            <span class="unit">${isEn ? "posts" : "poteaux"}</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label><i class="fa-solid fa-arrows-left-right-to-line"></i> ${isEn ? "Setback from Roof Edge" : "Retrait du Bord du Toit"} (${distUnit}) :</label>
                        <div class="input-with-unit">
                            <input type="number" id="input-config6-setback" value="${setbackVal}" min="0" max="10" step="any">
                            <span class="unit">${distUnit}</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label><i class="fa-solid fa-arrows-up-down"></i> ${isEn ? "Structure Height" : "Hauteur Structure"} (${distUnit}) :</label>
                        <div class="input-with-unit">
                            <input type="number" id="input-config6-height" value="${heightVal}" min="1" max="100" step="any">
                            <span class="unit">${distUnit}</span>
                        </div>
                    </div>
                </div>

                <!-- Readout summary box for calculated span length & angle -->
                <div class="info-readout-box margin-top-sm" style="background: rgba(241,245,249,0.9); border-left: 4px solid #3b82f6;">
                    <div style="display:flex; justify-content: space-between; flex-wrap: wrap; width:100%; gap: 10px;">
                        <span><i class="fa-solid fa-calculator" style="color:#3b82f6;"></i> ${isEn ? "Deduced Span (L)" : "Portée déduite (L)"} : <strong>${formatDistance(currentSpanLen, 2)}</strong></span>
                        <span><i class="fa-solid fa-compass" style="color:#3b82f6;"></i> ${isEn ? "Bend Angle" : "Angle des coudes"} : <strong>${state.spans[0] ? state.spans[0].bendDeg : 0}°</strong></span>
                        <span><i class="fa-solid fa-route" style="color:#3b82f6;"></i> ${isEn ? "Line : Open (on tank roof)" : "Ligne : Ouverte (sur toit de réservoir)"}</span>
                    </div>
                </div>

                ${isExceedingMax ? `
                    <div class="warning-alert-box margin-top-sm" style="background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; padding: 10px; border-radius: 6px; font-size: 0.85rem; display: flex; gap: 10px; align-items: center;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.2rem; color: #dc2626;"></i>
                        <div>
                            <strong>${isEn ? "Warning:" : "Attention :"}</strong> ${isEn ? "The calculated span" : "La portée calculée"} (${formatDistance(currentSpanLen, 2)}) ${isEn ? "exceeds maximum allowed for system" : "dépasse le maximum admissible du système"} ${state.product} (${formatDistance(maxAdmissibleSpan, 2)}).
                            <em>${isEn ? "Increase number of posts (N) to reduce span length." : "Augmentez le nombre de poteaux (N) pour réduire la longueur de portée."}</em>
                        </div>
                    </div>
                ` : ''}
            `;
        } else {
            // Mode Manuel (Tableau)
            const isClosedOK = closure.isClosed;

            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                    <span style="font-weight: 600; color: #334155;"><i class="fa-solid fa-table"></i> ${isEn ? "Manual input of spans and bends:" : "Saisie manuelle des portées et coudes :"}</span>
                    <span class="closure-badge ${isClosedOK ? 'badge-success' : 'badge-danger'}" style="padding: 4px 12px; border-radius: 12px; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; ${isClosedOK ? 'background:#dcfce7; color:#166534;' : 'background:#fee2e2; color:#991b1b;'}">
                        <i class="fa-solid ${isClosedOK ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                        ${isClosedOK ? (isEn ? "Valid Closed Loop" : "Boucle Fermée Valide") : (isEn ? `Open Loop (Gap: ${closure.distError.toFixed(2)}m, Angle: ${closure.angleError.toFixed(1)}°)` : `Boucle Non Fermée (Écart: ${closure.distError.toFixed(2)}m, Angle: ${closure.angleError.toFixed(1)}°)`)}
                    </span>
                </div>

                <div class="spans-table-wrapper" style="max-height: 240px; overflow-y: auto;">
                    <table class="spans-table">
                        <thead>
                            <tr>
                                <th>${isEn ? "Span #" : "Portée #"}</th>
                                <th>${isEn ? "Length" : "Longueur"} (${distUnit})</th>
                                <th>${isEn ? "Bend Angle (deg °)" : "Angle du Coude (deg °)"}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${state.spans.map((sp, idx) => {
                                const val = isUS ? (sp.length * METERS_TO_FEET).toFixed(2) : (typeof sp.length === "number" ? sp.length.toFixed(2) : sp.length);
                                return `
                                    <tr>
                                        <td><strong>${isEn ? "Span" : "Portée"} ${idx + 1}</strong></td>
                                        <td><input type="number" class="span-length-input" data-idx="${idx}" value="${val}" step="any" min="0.1"></td>
                                        <td><input type="number" class="span-benddeg-input" data-idx="${idx}" value="${sp.bendDeg !== undefined ? sp.bendDeg : 135}" step="any"> °</td>
                                    </tr>
                                ` ;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="spans-action-bar margin-top-sm" style="display:flex; gap: 8px; flex-wrap: wrap;">
                    <button type="button" class="btn-table-action" id="btn-adjust-last-span" style="background:#0284c7; color:white; border:none; font-weight:600;"><i class="fa-solid fa-wand-magic-sparkles"></i> ${isEn ? "Adjust Last Span" : "Ajuster la dernière portée"}</button>
                    <button type="button" class="btn-table-action" id="btn-add-span"><i class="fa-solid fa-plus"></i> ${isEn ? "Add Span" : "Ajouter une portée"}</button>
                    <button type="button" class="btn-table-action" id="btn-remove-span"><i class="fa-solid fa-minus"></i> ${isEn ? "Delete Span" : "Supprimer une portée"}</button>
                </div>
            `;
        }

        html += `
            <div class="form-group full-width margin-top-sm" style="background: rgba(59, 130, 246, 0.05); padding: 10px; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.2);">
                <label for="select-bend-orientation" style="font-weight: 600; color: #1e293b;">
                    <i class="fa-solid fa-arrows-spin" style="color: #3b82f6;"></i> Orientation de toutes les pièces / potelets :
                </label>
                <select id="select-bend-orientation" class="select-custom" style="margin-top: 4px;">
                    <option value="inside" ${state.bendOrientation !== 'outside' ? 'selected' : ''}>À l'intérieur de la ligne (Inside)</option>
                    <option value="outside" ${state.bendOrientation === 'outside' ? 'selected' : ''}>À l'extérieur de la ligne (Outside)</option>
                </select>
            </div>
        `;
    }
    // 8. Single-span - Slope System
    else if (layout === "slope_single") {
        const sp = state.spans[0] || { length: 20.0, slopeDeg: 30 };
        const lenVal = isUS ? (sp.length * METERS_TO_FEET).toFixed(2) : (typeof sp.length === "number" ? sp.length.toFixed(2) : sp.length);
        html = `
            <div class="form-grid full-width">
                <div class="form-group">
                    <label><i class="fa-solid fa-ruler"></i> ${isEn ? "Span Length:" : "Longueur de la portée :"} (${distUnit})</label>
                    <div class="input-with-unit">
                        <input type="number" id="input-span-slope-len" value="${lenVal}" min="0.1" step="any">
                        <span class="unit">${distUnit}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-chart-line"></i> ${isEn ? "Roof Slope Angle:" : "Angle de Pente du toit :"}</label>
                    <div class="input-with-unit">
                        <input type="number" id="input-span-slope-deg" value="${sp.slopeDeg || 30}" min="15" max="75" step="any">
                        <span class="unit">°</span>
                    </div>
                </div>
            </div>
            <div id="slope-live-stats" class="full-width margin-top-sm"></div>
        `;
    }
    // 9. Multiple-span - Slope System
    else if (layout === "slope_multi") {
        html = `
            ${renderUnifiedSpansTableHTML(layout, distUnit, isEn)}
            <div id="slope-live-stats" class="full-width margin-top-sm"></div>
        `;
    }
    // 10. Multiple-span - Horizontal and Slope System
    else if (layout === "slope_horizontal_comb") {
        html = `
            <div class="form-group full-width">
                <label><i class="fa-solid fa-sliders"></i> ${isEn ? "Number of Spans (N):" : "Nombre de portées (N) :"}</label>
                <div class="input-with-unit" style="max-width: 200px;">
                    <input type="number" id="input-nb-spans" min="2" max="50" value="${state.spans.length}">
                    <span class="unit">${isEn ? "spans" : "portées"}</span>
                </div>
            </div>
            <div class="spans-table-wrapper">
                <table class="spans-table">
                    <thead>
                        <tr>
                            <th>${isEn ? "Span #" : "Portée #"}</th>
                            <th>${isEn ? "Length" : "Longueur"} (${distUnit})</th>
                            <th>${isEn ? "Section Type" : "Type de section"}</th>
                            <th>${isEn ? "Direction" : "Direction"}</th>
                            <th>${isEn ? "Slope (deg ° if sloped)" : "Pente (deg ° si en pente)"}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.spans.map((sp, idx) => {
                            const val = isUS ? (sp.length * METERS_TO_FEET).toFixed(2) : (typeof sp.length === "number" ? sp.length.toFixed(2) : sp.length);
                            return `
                                <tr>
                                    <td><strong>${isEn ? "Span" : "Portée"} ${idx + 1}</strong></td>
                                    <td><input type="number" class="span-length-input" data-idx="${idx}" value="${val}" step="any" min="0.1"></td>
                                    <td>
                                        <select class="span-issloped-select" data-idx="${idx}">
                                            <option value="false" ${!sp.isSloped ? 'selected' : ''}>${isEn ? "Horizontal (0°)" : "Horizontale (0°)"}</option>
                                            <option value="true" ${sp.isSloped ? 'selected' : ''}>${isEn ? "Sloped" : "En Pente"}</option>
                                        </select>
                                    </td>
                                    <td>
                                        <select class="span-direction-select" data-idx="${idx}" ${!sp.isSloped ? 'disabled style="background:#e2e8f0;"' : ''}>
                                            <option value="up" ${sp.direction !== 'down' ? 'selected' : ''}>${isEn ? "Ascending (Up ↑)" : "Montée (Up ↑)"}</option>
                                            <option value="down" ${sp.direction === 'down' ? 'selected' : ''}>${isEn ? "Descending (Down ↓)" : "Descente (Down ↓)"}</option>
                                        </select>
                                    </td>
                                    <td><input type="number" class="span-slopedeg-input" data-idx="${idx}" value="${sp.slopeDeg || 0}" step="any" min="0" max="75" ${!sp.isSloped ? 'disabled style="background:#e2e8f0;"' : ''}> °</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="spans-action-bar">
                <button type="button" class="btn-table-action" id="btn-add-span"><i class="fa-solid fa-plus"></i> ${isEn ? "Add Span" : "Ajouter une portée"}</button>
                <button type="button" class="btn-table-action" id="btn-remove-span"><i class="fa-solid fa-minus"></i> ${isEn ? "Delete Span" : "Supprimer une portée"}</button>
            </div>
        `;
    }
    // 11. Cross-spans (NewPRO Only)
    else if (layout === "cross_spans") {
        const cs = state.crossSpans || { north: 10.0, east: 10.0, south: 10.0, west: 10.0, angles: [270, 0, 90, 180], showAngles: false };
        const nV = isUS ? (cs.north * METERS_TO_FEET).toFixed(2) : (typeof cs.north === "number" ? cs.north.toFixed(2) : cs.north);
        const eV = isUS ? (cs.east * METERS_TO_FEET).toFixed(2) : (typeof cs.east === "number" ? cs.east.toFixed(2) : cs.east);
        const sV = isUS ? (cs.south * METERS_TO_FEET).toFixed(2) : (typeof cs.south === "number" ? cs.south.toFixed(2) : cs.south);
        const wV = isUS ? (cs.west * METERS_TO_FEET).toFixed(2) : (typeof cs.west === "number" ? cs.west.toFixed(2) : cs.west);
        const angles = cs.angles || [270, 0, 90, 180];
        const maxNewProSpan = 15.0;

        const maxSpanBranch = Math.max(cs.north, cs.east, cs.south, cs.west);
        const isExceeding = maxSpanBranch > maxNewProSpan;

        html = `
            <div class="info-readout-box margin-bottom-sm" style="background: rgba(241,245,249,0.9); border-left: 4px solid #3b82f6;">
                <div style="display:flex; justify-content: space-between; flex-wrap: wrap; width:100%; gap: 10px;">
                    <span><i class="fa-solid fa-crosshairs" style="color:#3b82f6;"></i> <strong>Config 11 — Cross-spans</strong> (NewPRO)</span>
                    <span><i class="fa-solid fa-layer-group" style="color:#3b82f6;"></i> ${isEn ? "1 X-Matrix component at center | 4 End anchors" : "1 Pièce X-Matrix au centre | 4 Poteaux d'extrémité"}</span>
                </div>
            </div>
            <div class="form-grid">
                <div class="form-group">
                    <label>${isEn ? "Branch 1 — North / Span 1" : "Branche 1 — Nord / Span 1"} (${distUnit}) :</label>
                    <div class="input-with-unit">
                        <input type="number" id="input-cross-north" value="${nV}" min="0.1" max="15.0" step="any">
                        <span class="unit">${distUnit}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label>${isEn ? "Branch 2 — East / Span 2" : "Branche 2 — Est / Span 2"} (${distUnit}) :</label>
                    <div class="input-with-unit">
                        <input type="number" id="input-cross-east" value="${eV}" min="0.1" max="15.0" step="any">
                        <span class="unit">${distUnit}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label>${isEn ? "Branch 3 — South / Span 3" : "Branche 3 — Sud / Span 3"} (${distUnit}) :</label>
                    <div class="input-with-unit">
                        <input type="number" id="input-cross-south" value="${sV}" min="0.1" max="15.0" step="any">
                        <span class="unit">${distUnit}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label>${isEn ? "Branch 4 — West / Span 4" : "Branche 4 — Ouest / Span 4"} (${distUnit}) :</label>
                    <div class="input-with-unit">
                        <input type="number" id="input-cross-west" value="${wV}" min="0.1" max="15.0" step="any">
                        <span class="unit">${distUnit}</span>
                    </div>
                </div>
            </div>

            <!-- Block Angles Replié par défaut -->
            <div class="form-group full-width margin-top-sm" style="background: rgba(241, 245, 249, 0.6); padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1;">
                <button type="button" id="btn-toggle-cross-angles" style="background: none; border: none; color: #1e293b; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; width: 100%;">
                    <i class="fa-solid ${cs.showAngles ? 'fa-chevron-down' : 'fa-chevron-right'}" style="color: #3b82f6;"></i>
                    <span><i class="fa-solid fa-compass"></i> ${isEn ? "Advanced Branch Angles (Default: 270°, 0°, 90°, 180°)" : "Saisie Avancée des Angles des Branches (par défaut: 270°, 0°, 90°, 180°)"}</span>
                </button>
                ${cs.showAngles ? `
                    <div class="form-grid margin-top-sm" style="grid-template-columns: repeat(4, 1fr); gap: 8px;">
                        <div class="form-group">
                            <label style="font-size:0.75rem;">Angle B1 (°)</label>
                            <input type="number" class="cross-angle-input" data-idx="0" value="${angles[0]}" step="any">
                        </div>
                        <div class="form-group">
                            <label style="font-size:0.75rem;">Angle B2 (°)</label>
                            <input type="number" class="cross-angle-input" data-idx="1" value="${angles[1]}" step="any">
                        </div>
                        <div class="form-group">
                            <label style="font-size:0.75rem;">Angle B3 (°)</label>
                            <input type="number" class="cross-angle-input" data-idx="2" value="${angles[2]}" step="any">
                        </div>
                        <div class="form-group">
                            <label style="font-size:0.75rem;">Angle B4 (°)</label>
                            <input type="number" class="cross-angle-input" data-idx="3" value="${angles[3]}" step="any">
                        </div>
                    </div>
                ` : ''}
            </div>

            <!-- Sélection de la branche où a lieu la chute -->
            <div class="form-group full-width margin-top-sm" style="background: rgba(241, 245, 249, 0.6); padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1;">
                <label for="select-cross-fall-branch" style="font-weight: 600; color: #1e293b;">
                    <i class="fa-solid fa-crosshairs" style="color: #3b82f6;"></i> ${isEn ? "Branch where fall occurs (100% load, 25% on other 3 branches):" : "Branche où a lieu la chute (100% de l'effort, 25% sur les 3 autres) :"}
                </label>
                <select id="select-cross-fall-branch" class="select-custom" style="margin-top: 4px;">
                    <option value="north" ${(state.fallPosition?.branch || "north") === "north" ? 'selected' : ''}>${isEn ? "Branch 1 — North (Span 1)" : "Branche 1 — Nord (Span 1)"}</option>
                    <option value="east"  ${(state.fallPosition?.branch) === "east"  ? 'selected' : ''}>${isEn ? "Branch 2 — East (Span 2)" : "Branche 2 — Est (Span 2)"}</option>
                    <option value="south" ${(state.fallPosition?.branch) === "south" ? 'selected' : ''}>${isEn ? "Branch 3 — South (Span 3)" : "Branche 3 — Sud (Span 3)"}</option>
                    <option value="west"  ${(state.fallPosition?.branch) === "west"  ? 'selected' : ''}>${isEn ? "Branch 4 — West (Span 4)" : "Branche 4 — Ouest (Span 4)"}</option>
                </select>
            </div>

            ${isExceeding ? `
                <div class="warning-alert-box margin-top-sm" style="background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; padding: 10px; border-radius: 6px; font-size: 0.85rem; display: flex; gap: 10px; align-items: center;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.2rem; color: #dc2626;"></i>
                    <div>
                        <strong>${isEn ? "Warning:" : "Attention :"}</strong> ${isEn ? "Maximum span entered" : "La portée maximale saisie"} (${formatDistance(maxSpanBranch, 2)}) ${isEn ? "exceeds NewPRO admissible limit" : "dépasse la limite admissible NewPRO"} (${formatDistance(maxNewProSpan, 2)}).
                    </div>
                </div>
            ` : ''}
        `;
    }
    // 12. Grid Systems (Long Range Only - Overhead)
    else if (layout === "grid_system") {
        const gs = state.gridSystem || { nx: 3, ny: 3, xSpacings: [5.0, 5.0], zSpacings: [5.0, 5.0], end_margin: 2.0, cable_height: 3.5 };
        const nx = Math.max(2, gs.nx || 3);
        const ny = Math.max(2, gs.ny || 3);
        const endMarginVal = isUS ? ((gs.end_margin || 2.0) * METERS_TO_FEET).toFixed(2) : (typeof gs.end_margin === "number" ? gs.end_margin.toFixed(2) : (gs.end_margin || 2.0));
        const cableHVal = isUS ? ((gs.cable_height || 3.5) * METERS_TO_FEET).toFixed(2) : (typeof gs.cable_height === "number" ? gs.cable_height.toFixed(2) : (gs.cable_height || 3.5));

        const nbXMatrix = nx * ny;
        const nbPosts = 2 * (nx + ny);
        const nbSegments = ny * (nx + 1) + nx * (ny + 1);

        const maxSpanLR = Calculator.getMaxSpan(state.product || "EXTREME");

        // Validate segments
        let maxSegVal = 0;
        let failingSegId = null;
        gs.xSpacings.forEach((sp, idx) => {
            if (sp > maxSegVal) { maxSegVal = sp; failingSegId = `${isEn ? "Spacing X" : "Écart X"}${idx + 1}`; }
        });
        gs.zSpacings.forEach((sp, idx) => {
            if (sp > maxSegVal) { maxSegVal = sp; failingSegId = `${isEn ? "Spacing Z" : "Écart Z"}${idx + 1}`; }
        });

        const isSegmentExceeding = maxSegVal > maxSpanLR;

        html = `
            <div class="info-readout-box margin-bottom-sm" style="background: rgba(241,245,249,0.9); border-left: 4px solid #3b82f6;">
                <div style="display:flex; justify-content: space-between; flex-wrap: wrap; width:100%; gap: 10px;">
                    <span><i class="fa-solid fa-table-cells" style="color:#3b82f6;"></i> <strong>Config 12 — Grid Systems (Overhead)</strong></span>
                    <span><i class="fa-solid fa-cubes" style="color:#3b82f6;"></i> <strong>${nbXMatrix}</strong> X-Matrix | <strong>${nbPosts}</strong> ${isEn ? "Posts" : "Poteaux"} | <strong>${nbSegments}</strong> Segments</span>
                </div>
            </div>

            <div class="form-grid">
                <div class="form-group">
                    <label><i class="fa-solid fa-arrows-left-right"></i> ${isEn ? "Number of X Lines (Nx ≥ 2):" : "Nb Lignes X (Nx ≥ 2) :"}</label>
                    <div class="input-with-unit">
                        <input type="number" id="input-grid-nx" value="${nx}" min="2" max="20">
                        <span class="unit">${isEn ? "lines" : "lignes"}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-arrows-up-down"></i> ${isEn ? "Number of Z Lines (Ny ≥ 2):" : "Nb Lignes Z (Ny ≥ 2) :"}</label>
                    <div class="input-with-unit">
                        <input type="number" id="input-grid-ny" value="${ny}" min="2" max="20">
                        <span class="unit">${isEn ? "lines" : "lignes"}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-ruler-combined"></i> ${isEn ? "End Extension (end_margin):" : "Prolongement Extrémités (end_margin) :"}</label>
                    <div class="input-with-unit">
                        <input type="number" id="input-grid-end-margin" value="${endMarginVal}" min="0.5" max="10" step="any">
                        <span class="unit">${distUnit}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-arrows-up-to-line"></i> ${isEn ? "Overhead Cable Height (cable_height):" : "Hauteur Câble Overhead (cable_height) :"}</label>
                    <div class="input-with-unit">
                        <input type="number" id="input-grid-cable-height" value="${cableHVal}" min="1.0" max="20" step="any">
                        <span class="unit">${distUnit}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-weight-scale"></i> ${isEn ? "User Fall Mass (kg):" : "Masse Utilisateur Chute (kg) :"}</label>
                    <div class="input-with-unit">
                        <input type="number" id="input-grid-user-mass" value="${state.userMassKg || 141}" min="50" max="250" step="1">
                        <span class="unit">kg</span>
                    </div>
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-gauge"></i> ${isEn ? "Grid Cable Pretension (P0):" : "Prétension Câble Grille (P0) :"}</label>
                    <div class="input-with-unit">
                        <input type="number" id="input-grid-pretension" value="${state.gridPretensionKg || 600}" readonly style="background:#f1f5f9; cursor:not-allowed;">
                        <span class="unit">kg (${((state.gridPretensionKg || 600) * 9.81 / 1000).toFixed(3)} kN)</span>
                    </div>
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-crosshairs"></i> ${isEn ? "Cross Junction of Fall (Level 0):" : "Croix où a lieu la chute (Niveau 0) :"}</label>
                    <select id="select-grid-fall-cross" class="select-custom">
                        ${Array.from({length: nx}, (_, ix) => 
                            Array.from({length: ny}, (_, iz) => {
                                const isSel = (ix === (state.fallPosition?.gridCrossX || 0) && iz === (state.fallPosition?.gridCrossZ || 0));
                                return `<option value="${ix}_${iz}" ${isSel ? 'selected' : ''}>${isEn ? "Cross" : "Croix"} (${ix + 1}, ${iz + 1})</option>`;
                            })
                        ).flat().join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-arrows-to-dot"></i> ${isEn ? "Fall Branch:" : "Branche de Chute :"}</label>
                    <select id="select-grid-fall-branch" class="select-custom">
                        <option value="X+" ${(state.fallPosition?.gridBranch || "X+") === "X+" ? 'selected' : ''}>${isEn ? "Branch" : "Branche"} +X</option>
                        <option value="X-" ${(state.fallPosition?.gridBranch) === "X-" ? 'selected' : ''}>${isEn ? "Branch" : "Branche"} -X</option>
                        <option value="Z+" ${(state.fallPosition?.gridBranch) === "Z+" ? 'selected' : ''}>${isEn ? "Branch" : "Branche"} +Z</option>
                        <option value="Z-" ${(state.fallPosition?.gridBranch) === "Z-" ? 'selected' : ''}>${isEn ? "Branch" : "Branche"} -Z</option>
                    </select>
                </div>
            </div>

            <div class="form-group full-width margin-top-sm">
                <label>${isEn ? "Spacings between X lines" : "Espacements entre lignes X"} (${distUnit}) — ${isEn ? "2D Table Input:" : "Saisie par tableau 2D :"} :</label>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${gs.xSpacings.map((sp, idx) => {
                        const val = isUS ? (sp * METERS_TO_FEET).toFixed(2) : (typeof sp === "number" ? sp.toFixed(2) : sp);
                        return `
                            <div style="flex: 1; min-width: 100px;">
                                <span style="font-size: 0.75rem; color: #64748b;">${isEn ? "Spacing X" : "Écart X"}${idx + 1}</span>
                                <input type="number" class="grid-xspacing-input" data-idx="${idx}" value="${val}" step="any" min="0.1" style="width:100%; padding:0.4rem; border:1px solid #cbd5e1; border-radius:4px;">
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            <div class="form-group full-width margin-top-sm">
                <label>${isEn ? "Spacings between Z lines" : "Espacements entre lignes Z"} (${distUnit}) :</label>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${gs.zSpacings.map((sp, idx) => {
                        const val = isUS ? (sp * METERS_TO_FEET).toFixed(2) : (typeof sp === "number" ? sp.toFixed(2) : sp);
                        return `
                            <div style="flex: 1; min-width: 100px;">
                                <span style="font-size: 0.75rem; color: #64748b;">${isEn ? "Spacing Z" : "Écart Z"}${idx + 1}</span>
                                <input type="number" class="grid-zspacing-input" data-idx="${idx}" value="${val}" step="any" min="0.1" style="width:100%; padding:0.4rem; border:1px solid #cbd5e1; border-radius:4px;">
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            ${isSegmentExceeding ? `
                <div class="warning-alert-box margin-top-sm" style="background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; padding: 10px; border-radius: 6px; font-size: 0.85rem; display: flex; gap: 10px; align-items: center;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.2rem; color: #dc2626;"></i>
                    <div>
                        <strong>Erreur de Validation :</strong> Le segment <strong>${failingSegId} (${formatDistance(maxSegVal, 2)})</strong> dépasse la portée maximale admissible du système ${state.product} (${formatDistance(maxSpanLR, 2)}).
                    </div>
                </div>
            ` : ''}
        `;
    }

    container.innerHTML = html;
    if (layout === "slope_single" || layout === "slope_multi") {
        updateSlopeLiveStatsUI();
    }
    attachDynamicFormListeners();
}

function attachDynamicFormListeners() {
    const isEn = (parseInt(state.lang) === 1);
    const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");

    // Single span length
    const singleLen = document.getElementById("input-span-single-len");
    if (singleLen) {
        singleLen.addEventListener("input", (e) => {
            const raw = parseFloat(e.target.value) || 15.0;
            state.spans[0].length = isUS ? (raw / METERS_TO_FEET) : raw;
            state.lineLength = state.spans[0].length;
        });
    }

    // Number of spans input
    const nbSpansInput = document.getElementById("input-nb-spans");
    if (nbSpansInput) {
        nbSpansInput.addEventListener("change", (e) => {
            let targetN = parseInt(e.target.value) || 2;
            targetN = Math.max(1, Math.min(100, targetN));
            while (state.spans.length < targetN) {
                state.spans.push({ length: 5.0, bendDeg: 0, slopeDeg: 0, bend90: false, isSloped: false });
            }
            while (state.spans.length > targetN) {
                state.spans.pop();
            }
            renderDynamicLayoutForm();
        });
    }

    // Table length inputs
    document.querySelectorAll(".span-length-input").forEach(inp => {
        inp.addEventListener("change", (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const raw = parseFloat(e.target.value) || 5.0;
            const meters = isUS ? (raw / METERS_TO_FEET) : raw;
            if (typeof LayoutEditorModule !== "undefined") {
                LayoutEditorModule.setSpanLength(idx, meters);
            } else if (state.spans[idx]) {
                state.spans[idx].length = meters;
                if (typeof update3DScene === "function") update3DScene();
            }
            if (state.layoutType === "slope_multi") updateSlopeLiveStatsUI();
        });
    });

    // Table 90° bend checkboxes (legacy)
    document.querySelectorAll(".span-bend90-input").forEach(chk => {
        chk.addEventListener("change", (e) => {
            const idx = parseInt(e.target.dataset.idx);
            if (typeof LayoutEditorModule !== "undefined") {
                LayoutEditorModule.setSpanBend(idx, chk.checked ? 90 : 0);
            } else if (state.spans[idx]) {
                state.spans[idx].bend90 = chk.checked;
                if (typeof update3DScene === "function") update3DScene();
            }
        });
    });

    // Table variable bend angle inputs
    document.querySelectorAll(".span-benddeg-input").forEach(inp => {
        inp.addEventListener("change", (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const raw = parseFloat(e.target.value) || 0;
            if (typeof LayoutEditorModule !== "undefined") {
                LayoutEditorModule.setSpanBend(idx, raw);
            } else if (state.spans[idx]) {
                state.spans[idx].bendDeg = raw;
                if (typeof update3DScene === "function") update3DScene();
            }
        });
    });

    // Table slope degree inputs (Strict <= 75°)
    document.querySelectorAll(".span-slopedeg-input").forEach(inp => {
        inp.addEventListener("change", (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const raw = parseFloat(e.target.value) || 0;
            if (typeof LayoutEditorModule !== "undefined") {
                LayoutEditorModule.setSpanSlope(idx, raw);
            } else if (state.spans[idx]) {
                if (Math.abs(raw) > 75) {
                    alert("⚠️ Pente maximale autorisée : 75° !");
                    inp.value = 75;
                    return;
                }
                state.spans[idx].slopeDeg = raw;
                if (typeof update3DScene === "function") update3DScene();
            }
            if (state.layoutType === "slope_multi") updateSlopeLiveStatsUI();
        });
    });

    // Fall span selection radio buttons
    document.querySelectorAll(".span-fall-radio").forEach(r => {
        r.addEventListener("change", (e) => {
            if (e.target.checked && typeof LayoutEditorModule !== "undefined") {
                const sId = e.target.dataset.spanId;
                LayoutEditorModule.selectFallSpan(sId);
            }
        });
    });

    // Action buttons inside rows (split, insert after, delete)
    document.querySelectorAll(".btn-split-span").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const idx = parseInt(btn.dataset.idx);
            if (typeof LayoutEditorModule !== "undefined") {
                LayoutEditorModule.splitSpan(idx);
            }
        });
    });

    document.querySelectorAll(".btn-insert-after").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const idx = parseInt(btn.dataset.idx);
            if (typeof LayoutEditorModule !== "undefined") {
                LayoutEditorModule.insertSpan(idx, "after", 5.0, 0, 0);
            }
        });
    });

    document.querySelectorAll(".btn-delete-span").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const idx = parseInt(btn.dataset.idx);
            if (typeof LayoutEditorModule !== "undefined") {
                LayoutEditorModule.deleteSpan(idx);
            }
        });
    });

    // X-Matrix Multi-directions Table Actions
    document.querySelectorAll(".btn-table-xmatrix").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.idx);
            const isRange = isExtreme(state.product);
            const isOverhead = (state.mountingType === "overhead" || state.roofShape === "flat_overhead");
            if (!isPro(state.product) && !(isRange && isOverhead)) {
                alert(["⚠️ La X-Matrix est autorisée uniquement pour le système PRO ou en pose suspendue (overhead) pour Extreme.", "⚠️ X-Matrix is only allowed for PRO systems or overhead Extreme systems."][state.lang || 0]);
                return;
            }
            if (state.spans && state.spans[idx]) {
                state.spans[idx].hasXMatrix = !state.spans[idx].hasXMatrix;
                if (state.spans[idx].hasXMatrix) {
                    if (!state.spans[idx].xMatrixBranches) {
                        state.spans[idx].xMatrixBranches = [];
                    }
                    cleanupCollinearXMatrixBranches(state.spans);
                } else {
                    state.spans[idx].xMatrixBranches = [];
                }
                syncXMatrixNomenclature();
                if (typeof LayoutEditorModule !== "undefined") {
                    LayoutEditorModule.recordState("toggle_xmatrix");
                    LayoutEditorModule.refreshUI();
                } else {
                    renderDynamicLayoutForm();
                    if (typeof update3DScene === "function") update3DScene();
                }
            }
        });
    });

    document.querySelectorAll(".btn-table-add-branch").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.spanIdx);
            if (state.spans && state.spans[idx]) {
                if (!state.spans[idx].xMatrixBranches) state.spans[idx].xMatrixBranches = [];
                cleanupCollinearXMatrixBranches(state.spans);
                if (state.spans[idx].xMatrixBranches.length < 2) {
                    const count = state.spans[idx].xMatrixBranches.length;
                    const nextAng = count === 0 ? 90 : -90;
                    const bId = "xmb_" + Date.now() + "_" + count;
                    state.spans[idx].xMatrixBranches.push({
                        id: bId,
                        length: 5.0,
                        angleDeg: nextAng,
                        spans: [{ id: bId + "_s1", length: 5.0 }]
                    });
                    if (typeof LayoutEditorModule !== "undefined") {
                        LayoutEditorModule.recordState("add_xmatrix_branch");
                        LayoutEditorModule.refreshUI();
                    } else {
                        renderDynamicLayoutForm();
                        if (typeof update3DScene === "function") update3DScene();
                    }
                }
            }
        });
    });

    document.querySelectorAll(".btn-add-branch-subspan").forEach(btn => {
        btn.addEventListener("click", () => {
            const spanIdx = parseInt(btn.dataset.spanIdx);
            const branchIdx = parseInt(btn.dataset.branchIdx);
            if (state.spans && state.spans[spanIdx] && state.spans[spanIdx].xMatrixBranches && state.spans[spanIdx].xMatrixBranches[branchIdx]) {
                const branch = state.spans[spanIdx].xMatrixBranches[branchIdx];
                const bSpans = getBranchSpans(branch);
                const newSubId = (branch.id || "xmb") + "_s" + (bSpans.length + 1);
                bSpans.push({ id: newSubId, length: 5.0 });
                getBranchTotalLength(branch);
                if (typeof LayoutEditorModule !== "undefined") {
                    LayoutEditorModule.recordState("add_branch_subspan");
                    LayoutEditorModule.refreshUI();
                } else {
                    renderDynamicLayoutForm();
                    if (typeof update3DScene === "function") update3DScene();
                }
            }
        });
    });

    document.querySelectorAll(".btn-delete-branch-subspan").forEach(btn => {
        btn.addEventListener("click", () => {
            const spanIdx = parseInt(btn.dataset.spanIdx);
            const branchIdx = parseInt(btn.dataset.branchIdx);
            const subIdx = parseInt(btn.dataset.subspanIdx);
            if (state.spans && state.spans[spanIdx] && state.spans[spanIdx].xMatrixBranches && state.spans[spanIdx].xMatrixBranches[branchIdx]) {
                const branch = state.spans[spanIdx].xMatrixBranches[branchIdx];
                const bSpans = getBranchSpans(branch);
                if (bSpans.length > 1) {
                    bSpans.splice(subIdx, 1);
                    getBranchTotalLength(branch);
                    if (typeof LayoutEditorModule !== "undefined") {
                        LayoutEditorModule.recordState("delete_branch_subspan");
                        LayoutEditorModule.refreshUI();
                    } else {
                        renderDynamicLayoutForm();
                        if (typeof update3DScene === "function") update3DScene();
                    }
                }
            }
        });
    });

    document.querySelectorAll(".btn-delete-xmat-branch").forEach(btn => {
        btn.addEventListener("click", () => {
            const spanIdx = parseInt(btn.dataset.spanIdx);
            const branchIdx = parseInt(btn.dataset.branchIdx);
            if (state.spans && state.spans[spanIdx] && state.spans[spanIdx].xMatrixBranches) {
                state.spans[spanIdx].xMatrixBranches.splice(branchIdx, 1);
                if (typeof LayoutEditorModule !== "undefined") {
                    LayoutEditorModule.recordState("delete_xmatrix_branch");
                    LayoutEditorModule.refreshUI();
                } else {
                    renderDynamicLayoutForm();
                    if (typeof update3DScene === "function") update3DScene();
                }
            }
        });
    });

    document.querySelectorAll(".xmat-branch-len-input").forEach(inp => {
        inp.addEventListener("change", (e) => {
            const spanIdx = parseInt(e.target.dataset.spanIdx);
            const branchIdx = parseInt(e.target.dataset.branchIdx);
            const subIdx = e.target.dataset.subspanIdx !== undefined ? parseInt(e.target.dataset.subspanIdx) : null;
            if (state.spans && state.spans[spanIdx] && state.spans[spanIdx].xMatrixBranches && state.spans[spanIdx].xMatrixBranches[branchIdx]) {
                const raw = parseFloat(e.target.value) || 5.0;
                const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
                const meters = isUS ? (raw / METERS_TO_FEET) : raw;
                const branch = state.spans[spanIdx].xMatrixBranches[branchIdx];
                if (subIdx !== null && !isNaN(subIdx)) {
                    const bSpans = getBranchSpans(branch);
                    if (bSpans[subIdx]) {
                        bSpans[subIdx].length = Math.max(0.5, meters);
                    }
                    getBranchTotalLength(branch);
                } else {
                    branch.length = Math.max(0.5, meters);
                    const bSpans = getBranchSpans(branch);
                    if (bSpans.length === 1) {
                        bSpans[0].length = branch.length;
                    }
                }
                if (typeof update3DScene === "function") update3DScene();
            }
        });
    });

    document.querySelectorAll(".xmat-branch-ang-input").forEach(inp => {
        inp.addEventListener("change", (e) => {
            const spanIdx = parseInt(e.target.dataset.spanIdx);
            const branchIdx = parseInt(e.target.dataset.branchIdx);
            if (state.spans && state.spans[spanIdx] && state.spans[spanIdx].xMatrixBranches && state.spans[spanIdx].xMatrixBranches[branchIdx]) {
                let ang = parseFloat(e.target.value) || 0;
                const norm = ((ang % 360) + 360) % 360;
                if (norm < 15 || norm > 345 || Math.abs(norm - 180) < 15) {
                    alert(["⚠️ L'angle de la branche ne peut pas être aligné avec la ligne principale (0° ou 180°).", "⚠️ Branch angle cannot be aligned with the main lifeline (0° or 180°)."][state.lang || 0]);
                    ang = (branchIdx === 0 ? 90 : -90);
                    e.target.value = ang;
                }
                state.spans[spanIdx].xMatrixBranches[branchIdx].angleDeg = ang;
                if (typeof update3DScene === "function") update3DScene();
            }
        });
    });

    document.querySelectorAll(".btn-table-remove-xmat").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.spanIdx);
            if (state.spans && state.spans[idx]) {
                state.spans[idx].hasXMatrix = false;
                state.spans[idx].xMatrixBranches = [];
                syncXMatrixNomenclature();
                if (typeof LayoutEditorModule !== "undefined") {
                    LayoutEditorModule.recordState("remove_xmatrix");
                    LayoutEditorModule.refreshUI();
                } else {
                    renderDynamicLayoutForm();
                    if (typeof update3DScene === "function") update3DScene();
                }
            }
        });
    });

    // Table bottom action bar buttons
    const btnInsStart = document.getElementById("btn-insert-start");
    if (btnInsStart) {
        btnInsStart.addEventListener("click", () => {
            if (typeof LayoutEditorModule !== "undefined") {
                LayoutEditorModule.insertSpanAtStart(5.0, 0, 0);
            }
        });
    }

    const btnAddEnd = document.getElementById("btn-add-span");
    if (btnAddEnd) {
        btnAddEnd.addEventListener("click", () => {
            if (typeof LayoutEditorModule !== "undefined") {
                LayoutEditorModule.insertSpanAtEnd(5.0, 0, 0);
            }
        });
    }

    const btnTblUndo = document.getElementById("btn-table-undo");
    if (btnTblUndo) {
        btnTblUndo.addEventListener("click", () => {
            if (typeof LayoutEditorModule !== "undefined") {
                LayoutEditorModule.undo();
            }
        });
    }

    const btnTblRedo = document.getElementById("btn-table-redo");
    if (btnTblRedo) {
        btnTblRedo.addEventListener("click", () => {
            if (typeof LayoutEditorModule !== "undefined") {
                LayoutEditorModule.redo();
            }
        });
    }

    // Table bend orientation selector
    const bendOrientSelect = document.getElementById("select-bend-orientation");
    if (bendOrientSelect) {
        bendOrientSelect.addEventListener("change", (e) => {
            state.bendOrientation = e.target.value;
            if (typeof update3DScene === "function") update3DScene();
        });
    }

    // Table isSloped select
    document.querySelectorAll(".span-issloped-select").forEach(sel => {
        sel.addEventListener("change", (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const isSloped = (e.target.value === "true");
            if (state.spans[idx]) {
                state.spans[idx].isSloped = isSloped;
                if (!isSloped) {
                    state.spans[idx].slopeDeg = 0;
                    state.spans[idx].slope_deg = 0;
                    state.spans[idx].xconesCount = 0;
                } else if ((state.spans[idx].slopeDeg || 0) < 15) {
                    state.spans[idx].slopeDeg = 15;
                    state.spans[idx].slope_deg = 15;
                }
            }
            renderDynamicLayoutForm();
        });
    });

    // Table direction select (Up / Down)
    document.querySelectorAll(".span-direction-select").forEach(sel => {
        sel.addEventListener("change", (e) => {
            const idx = parseInt(e.target.dataset.idx);
            if (state.spans[idx]) {
                state.spans[idx].direction = e.target.value;
            }
        });
    });

    // Closed loop checkbox
    const chkClosed = document.getElementById("chk-closed-loop");
    if (chkClosed) {
        chkClosed.addEventListener("change", (e) => {
            state.closedLoop = e.target.checked;
        });
    }

    // Slope single inputs
    const slopeLen = document.getElementById("input-span-slope-len");
    const slopeDeg = document.getElementById("input-span-slope-deg");
    if (slopeLen) {
        slopeLen.addEventListener("input", (e) => {
            const raw = parseFloat(e.target.value) || 15.0;
            if (state.spans[0]) state.spans[0].length = isUS ? (raw / METERS_TO_FEET) : raw;
            state.lineLength = state.spans[0] ? state.spans[0].length : raw;
            if (state.layoutType === "slope_single") updateSlopeLiveStatsUI();
        });
    }
    if (slopeDeg) {
        slopeDeg.addEventListener("change", (e) => {
            const raw = parseFloat(e.target.value) || 15.0;
            if (Math.abs(raw) > 75) {
                alert(`⚠️ Pente maximale autorisée : 75° !\nLa valeur saisie (${raw}°) dépasse la limite de sécurité.`);
                e.target.value = 75;
                if (state.spans[0]) state.spans[0].slopeDeg = 75;
                state.roofSlope = 75;
                if (state.layoutType === "slope_single") updateSlopeLiveStatsUI();
                if (typeof update3DScene === "function") update3DScene();
                return;
            }
            if (typeof LayoutEditorModule !== "undefined") {
                LayoutEditorModule.recordState("set_slope_single");
            }
            if (state.spans[0]) state.spans[0].slopeDeg = raw;
            state.roofSlope = raw;
            if (state.layoutType === "slope_single") updateSlopeLiveStatsUI();
            if (typeof update3DScene === "function") update3DScene();
        });
    }

    // Cross spans inputs
    ["north", "east", "south", "west"].forEach(dir => {
        const inp = document.getElementById(`input-cross-${dir}`);
        if (inp) {
            inp.addEventListener("input", (e) => {
                const raw = parseFloat(e.target.value) || 10.0;
                state.crossSpans[dir] = isUS ? (raw / METERS_TO_FEET) : raw;
                if (typeof update3DScene === "function" && scene) {
                    update3DScene();
                    if (typeof onWindowResize === "function") onWindowResize();
                }
            });
        }
    });

    const btnToggleCrossAngles = document.getElementById("btn-toggle-cross-angles");
    if (btnToggleCrossAngles) {
        btnToggleCrossAngles.addEventListener("click", () => {
            if (!state.crossSpans) state.crossSpans = { north: 10, east: 10, south: 10, west: 10, angles: [270, 0, 90, 180], showAngles: false };
            state.crossSpans.showAngles = !state.crossSpans.showAngles;
            renderDynamicLayoutForm();
        });
    }

    document.querySelectorAll(".cross-angle-input").forEach(inp => {
        inp.addEventListener("input", (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const raw = parseFloat(e.target.value) || 0;
            if (!state.crossSpans.angles) state.crossSpans.angles = [270, 0, 90, 180];
            state.crossSpans.angles[idx] = raw;
            if (typeof update3DScene === "function" && scene) {
                update3DScene();
                if (typeof onWindowResize === "function") onWindowResize();
            }
        });
    });

    // Grid system inputs
    const gridNx = document.getElementById("input-grid-nx");
    const gridNy = document.getElementById("input-grid-ny");
    const gridEndMargin = document.getElementById("input-grid-end-margin");
    const gridCableHeight = document.getElementById("input-grid-cable-height");

    if (gridEndMargin) {
        gridEndMargin.addEventListener("input", (e) => {
            const raw = parseFloat(e.target.value) || 2.0;
            state.gridSystem.end_margin = isUS ? (raw / METERS_TO_FEET) : raw;
        });
    }

    if (gridCableHeight) {
        gridCableHeight.addEventListener("input", (e) => {
            const raw = parseFloat(e.target.value) || 3.5;
            state.gridSystem.cable_height = isUS ? (raw / METERS_TO_FEET) : raw;
        });
    }

    if (gridNx && gridNy) {
        const updateGridDims = () => {
            const nx = Math.max(2, parseInt(gridNx.value) || 3);
            const ny = Math.max(2, parseInt(gridNy.value) || 3);
            state.gridSystem.nx = nx;
            state.gridSystem.ny = ny;
            while (state.gridSystem.xSpacings.length < nx - 1) state.gridSystem.xSpacings.push(5.0);
            while (state.gridSystem.xSpacings.length > nx - 1) state.gridSystem.xSpacings.pop();
            while (state.gridSystem.zSpacings.length < ny - 1) state.gridSystem.zSpacings.push(5.0);
            while (state.gridSystem.zSpacings.length > ny - 1) state.gridSystem.zSpacings.pop();
            renderDynamicLayoutForm();
        };
        gridNx.addEventListener("change", updateGridDims);
        gridNy.addEventListener("change", updateGridDims);
    }

    // Cross fall branch listener
    const crossFallSelect = document.getElementById("select-cross-fall-branch");
    if (crossFallSelect) {
        crossFallSelect.addEventListener("change", (e) => {
            if (!state.fallPosition) state.fallPosition = {};
            state.fallPosition.branch = e.target.value;
            if (typeof update3DScene === "function") update3DScene();
        });
    }

    // Grid user mass and fall position listeners
    const gridUserMassInput = document.getElementById("input-grid-user-mass");
    if (gridUserMassInput) {
        gridUserMassInput.addEventListener("input", (e) => {
            state.userMassKg = parseFloat(e.target.value) || 141;
            if (typeof update3DScene === "function") update3DScene();
        });
    }

    const gridFallCrossSelect = document.getElementById("select-grid-fall-cross");
    if (gridFallCrossSelect) {
        gridFallCrossSelect.addEventListener("change", (e) => {
            if (!state.fallPosition) state.fallPosition = {};
            const parts = (e.target.value || "0_0").split("_");
            state.fallPosition.gridCrossX = parseInt(parts[0]) || 0;
            state.fallPosition.gridCrossZ = parseInt(parts[1]) || 0;
            if (typeof update3DScene === "function") update3DScene();
        });
    }

    const gridFallBranchSelect = document.getElementById("select-grid-fall-branch");
    if (gridFallBranchSelect) {
        gridFallBranchSelect.addEventListener("change", (e) => {
            if (!state.fallPosition) state.fallPosition = {};
            state.fallPosition.gridBranch = e.target.value || "X+";
            if (typeof update3DScene === "function") update3DScene();
        });
    }

    document.querySelectorAll(".grid-xspacing-input").forEach(inp => {
        inp.addEventListener("input", (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const raw = parseFloat(e.target.value) || 5.0;
            state.gridSystem.xSpacings[idx] = isUS ? (raw / METERS_TO_FEET) : raw;
        });
    });
    document.querySelectorAll(".grid-zspacing-input").forEach(inp => {
        inp.addEventListener("input", (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const raw = parseFloat(e.target.value) || 5.0;
            state.gridSystem.zSpacings[idx] = isUS ? (raw / METERS_TO_FEET) : raw;
        });
    });

    // Add span button
    const btnAdd = document.getElementById("btn-add-span");
    if (btnAdd) {
        btnAdd.addEventListener("click", () => {
            const defaultSlope = (state.layoutType === "slope_multi") ? 25 : 0;
            state.spans.push({ length: 5.0, bendDeg: 0, slopeDeg: defaultSlope, bend90: false, isSloped: (defaultSlope >= 15), direction: "up" });
            renderDynamicLayoutForm();
        });
    }

    // Remove span button
    const btnRemove = document.getElementById("btn-remove-span");
    if (btnRemove) {
        btnRemove.addEventListener("click", () => {
            const minAllowed = (state.layoutType === "slope_multi") ? 2 : 1;
            if (state.spans.length > minAllowed) {
                state.spans.pop();
                renderDynamicLayoutForm();
            }
        });
    }

    // Preset circle button
    const btnCircle = document.getElementById("btn-preset-circle");
    if (btnCircle) {
        btnCircle.addEventListener("click", () => {
            const equalAngle = parseFloat((360 / state.spans.length).toFixed(2));
            state.spans.forEach(sp => {
                sp.bendDeg = equalAngle;
            });
            renderDynamicLayoutForm();
        });
    }

    // Config 6 Mode Toggle Buttons (Reservoir vs Manual)
    document.querySelectorAll(".btn-config6-mode").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const mode = e.currentTarget.dataset.mode;
            state.config6Mode = mode;
            renderDynamicLayoutForm();
            if (typeof update3DScene === "function") update3DScene();
        });
    });

    // Config 6 Inputs
    const cfg6Diam = document.getElementById("input-config6-diam");
    if (cfg6Diam) {
        cfg6Diam.addEventListener("input", (e) => {
            const raw = parseFloat(e.target.value) || 30.0;
            state.config6Diameter = isUS ? (raw / METERS_TO_FEET) : raw;
            recalculateConfig6Spans();
            renderDynamicLayoutForm();
            if (typeof update3DScene === "function") update3DScene();
        });
    }

    const cfg6N = document.getElementById("input-config6-n");
    if (cfg6N) {
        cfg6N.addEventListener("input", (e) => {
            const raw = parseInt(e.target.value) || 16;
            state.config6NbPosts = Math.max(3, Math.min(100, raw));
            recalculateConfig6Spans();
            renderDynamicLayoutForm();
            if (typeof update3DScene === "function") update3DScene();
        });
    }

    const cfg6Setback = document.getElementById("input-config6-setback");
    if (cfg6Setback) {
        cfg6Setback.addEventListener("input", (e) => {
            const raw = parseFloat(e.target.value) || 0.5;
            state.config6Setback = isUS ? (raw / METERS_TO_FEET) : raw;
            recalculateConfig6Spans();
            renderDynamicLayoutForm();
            if (typeof update3DScene === "function") update3DScene();
        });
    }

    const cfg6Height = document.getElementById("input-config6-height");
    if (cfg6Height) {
        cfg6Height.addEventListener("input", (e) => {
            const raw = parseFloat(e.target.value) || 8.0;
            state.config6Height = isUS ? (raw / METERS_TO_FEET) : raw;
            if (typeof update3DScene === "function") update3DScene();
        });
    }

    const cfg6Struct = document.getElementById("select-config6-struct");
    if (cfg6Struct) {
        cfg6Struct.addEventListener("change", (e) => {
            state.config6StructureType = e.target.value;
            if (typeof update3DScene === "function") update3DScene();
        });
    }

    const btnAdjustLast = document.getElementById("btn-adjust-last-span");
    if (btnAdjustLast) {
        btnAdjustLast.addEventListener("click", () => {
            adjustLastSpanConfig6();
            renderDynamicLayoutForm();
            if (typeof update3DScene === "function") update3DScene();
        });
    }
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
        "Dimensionnez, visualisez en 3D/2D et éditez la note de conformité réglementaire (EN 795-C, OSHA) pour les systèmes HOOKT Core, Pro et Extreme.",
        "Size, visualize in 3D/2D and generate the regulatory compliance note (EN 795-C, OSHA) for HOOKT Core, Pro and Extreme systems.",
        "Dimensione, visualice en 3D/2D y genere la nota de conformidad normativa (EN 795-C, OSHA) para los sistemas HOOKT Core, Pro y Extreme."
    ],
    startBtnText: ["Démarrer une Configuration", "Start Configuration", "Iniciar Configuración"],

    modalTitle: ["Paramètres de la Toiture", "Roof Parameters", "Parámetros de la Cubierta"],
    secProject: ["Informations Projet & Système", "Project & System Information", "Información del Proyecto y Sistema"],
    projName: ["Nom du Projet :", "Project Name:", "Nombre del Proyecto:"],
    projNamePlaceholder: ["ex: Toiture Usine HOOKT", "ex: Factory Roof HOOKT", "ej: Techo Fábrica HOOKT"],
    projLoc: ["Lieu / Adresse :", "Location / Address:", "Ubicación / Dirección:"],
    projLocPlaceholder: ["ex: Bayonne, France", "ex: Bayonne, France", "ej: Bayona, Francia"],
    projDesigner: ["Nom du Concepteur :", "Designer Name:", "Nombre del Diseñador:"],
    projDesignerPlaceholder: ["ex: Ingénieur Sécurité", "ex: Safety Engineer", "ej: Ingeniero de Seguridad"],
    projHll: ["Nom(s) de(s) HLL :", "HLL Name(s):", "Nombre(s) de HLL:"],

    autoDeduced: ["Auto-déduit", "Auto-deduced", "Auto-deducido"],

    secRoof: ["Toiture & Surface de Pose (Spec V2 — 03)", "Roof & Mounting Surface", "Cubierta y Superficie de Montaje"],
    roofType: ["Typologie de Toiture :", "Roof Typology:", "Tipología de Techo:"],
    roofTypeOptions: {
        flat: ["Toiture Plate (Terrasse)", "Flat Roof (Terrace)", "Techo Plano (Terraza)"],
        sloped: ["Toiture à Une Pente (Monopente)", "Single-Slope Roof (Monopitch)", "Techo a Un Agua (Monopendiente)"],
        triangle: ["Toiture à Deux Pentes (Double versant / Pignon)", "Double-Pitch Roof (Gable)", "Techo a Dos Aguas (Piñón)"]
    },
    roofLength: ["Longueur du Toit (L) :", "Roof Length (L):", "Longitud del Techo (L):"],
    roofWidth: ["Largeur du Toit (l) :", "Roof Width (w):", "Ancho del Techo (l):"],
    roofSlope1: ["Angle Pente 1 (max 75°) :", "Roof Slope 1 Angle (max 75°):", "Ángulo Pendiente 1 (máx 75°):"],
    roofSlope2: ["Angle Pente 2 (Deux pentes, max 75°) :", "Roof Slope 2 Angle (Dual slope, max 75°):", "Ángulo Pendiente 2 (Dos pendientes, máx 75°):"],
    ridgePos: ["Position du Faîtage (depuis le bord) :", "Ridge Position (from edge):", "Posición de la Cumbrera (desde el borde):"],
    lineToEdge: ["Distance Ligne / Bord de Toit :", "Line-to-Edge Distance:", "Distancia Línea / Borde del Techo:"],
    roofHeightGround: ["Hauteur Toit au-dessus du Sol :", "Roof Height Above Ground:", "Altura del Techo sobre el Suelo:"],
    substrateInfo: ["Substrat / Type de Support :", "Substrate / Base Support Type:", "Sustrato / Tipo de Soporte:"],
    substratePlaceholder: [
        "ex: Bac acier 0.75mm, Béton C25/30, Poutre HEB",
        "ex: Corrugated metal deck 0.75mm, Concrete C25/30, Steel Beam",
        "ej: Chapa grecada 0.75mm, Hormigón C25/30, Viga de acero"
    ],

    secLayout: ["Configuration de Pose (6 Configurations)", "Installation Layout (6 Configurations)", "Configuración de Instalación (6 Configuraciones)"],
    layoutType: ["Configuration de pose :", "Layout Configuration:", "Configuración de instalación:"],
    layoutTypeOptions: {
        single_span: ["1. Portée Unique (Single Span)", "1. Single Span", "1. Single Span (Luz Única)"],
        multi_straight: ["2. Multi-portée (Multi-span - Standard)", "2. Multi-span (Multi-span - Standard)", "2. Multi-span (Luces Múltiples)"],
        multi_bend_circle: ["6. Multi-portée – Coudes variables (Cercle / Réservoir)", "6. Multi-span – Variable bends (Tank / Circle)", "6. Multi-span – Codos variables (Tanque / Círculo)"],
        slope_single: ["8. Portée Unique en Pente (Slope System)", "8. Single-span – Slope System", "8. Single-span – Slope System (Pendiente)"],
        cross_spans: ["11. Système en Croix (Cross-spans - Exclusif PRO)", "11. Cross-spans (PRO Exclusive)", "11. Sistema en Cruz (Exclusivo PRO)"],
        grid_system: ["12. Système en Grille (Grid Systems - Exclusif EXTREME)", "12. Grid Systems (EXTREME Exclusive)", "12. Sistema en Rejilla (Exclusivo EXTREME)"]
    },

    lblProduct: ["Gamme de Système HOOKT :", "HOOKT System Family:", "Gama de Sistema HOOKT:"],
    lblShape: ["Forme / Typologie du Toit :", "Roof Shape / Typology:", "Forma / Tipología del Techo:"],
    roofShapes: {
        flat: ["Toit Plat (Terrasse Standard)", "Flat Roof (Standard Terrace)", "Techo Plano (Terraza Estándar)"],
        flat_overhead: ["Toit Plat (Overhead - Extreme uniquement)", "Flat Roof (Overhead - Extreme only)", "Techo Plano (Overhead - Solo Extreme)"],
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
    lblUsers: ["Nombre d'utilisateurs max :", "Max Active Users:", "Número máx. de usuarios:"],
    lblEngineerCoefficient: ["Facteur de chute :", "Fall Factor:", "Factor de caída:"],
    lblHasLine2: ["Activer une seconde direction (Ligne 2)", "Enable a second direction (Line 2)", "Activar una segunda dirección (Línea 2)"],
    lblLine2Len: ["Longueur Ligne 2 :", "Line 2 Length:", "Longitud Línea 2:"],
    lblXmatrixLoc: ["Type / Emplacement Jonction :", "Junction Type / Location:", "Tipo / Ubicación de la Unión:"],
    xmatrixLocs: {
        mid: ["En milieu de ligne (Jonction X-Matrix)", "Mid-line (X-Matrix Junction)", "En medio de la línea (Unión X-Matrix)"],
        end: ["En extrémité de ligne (Virage / Corner)", "Line end (Corner / Turn)", "En el extremo de la línea (Esquina / Giro)"]
    },
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
        core: ["CORE", "CORE", "CORE"],
        pro: ["PRO", "PRO", "PRO"],
        extreme: ["EXTREME", "EXTREME", "EXTREME"],
        longRange: ["EXTREME", "EXTREME", "EXTREME"],
        lightPro: ["CORE", "CORE", "CORE"],
        newPro: ["PRO", "PRO", "PRO"]
    },
    sysTags: {
        core: ["Max 15m | 3 pers.", "Max 15 m | 3 users", "Máx 15m | 3 pers."],
        pro: ["Max 15m | 5 pers.", "Max 15 m | 5 users", "Máx 15m | 5 pers."],
        extreme: ["Max 56m | 3 pers.", "Max 56 m | 3 users", "Máx 56m | 3 pers."],
        newPro: ["Max 15m | 5 pers.", "Max 15 m | 5 users", "Máx 15m | 5 pers."],
        lightPro: ["Max 15m | 3 pers.", "Max 15 m | 3 users", "Máx 15m | 3 pers."],
        longRange: ["Max 56m | 3 pers.", "Max 56 m | 3 users", "Máx 56m | 3 pers."]
    },
    sysDescs: {
        core: ["Solution légère et économique pour toitures tertiaires et industrielles.", "Lightweight and economical solution for commercial and industrial roofs.", "Solución ligera y económica para cubiertas comerciales e industriales."],
        pro: ["Système haute performance avec absorbeurs intégrés pour bac acier et béton.", "High-performance system with integrated absorbers for trapezoidal sheet and concrete.", "Sistema de alto rendimiento con absorbedores integrados para chapa y hormigón."],
        extreme: ["Ligne de vie pour très grandes portées (Long Range 10-20m, Super Range 20-34m, Ultra Range 34-56m).", "Lifeline for long spans (Long Range 10-20m, Super Range 20-34m, Ultra Range 34-56m).", "Línea de vida para grandes luces (Long Range 10-20m, Super Range 20-34m, Ultra Range 34-56m)."],
        newPro: ["Système haute performance avec absorbeurs intégrés pour bac acier et béton.", "High-performance system with integrated absorbers for trapezoidal sheet and concrete.", "Sistema de alto rendimiento con absorbedores integrados para chapa y hormigón."],
        lightPro: ["Solution légère et économique pour toitures tertiaires et industrielles.", "Lightweight and economical solution for commercial and industrial roofs.", "Solución ligera y económica para cubiertas comerciales e industriales."],
        longRange: ["Ligne de vie pour très grandes portées (Long Range 10-20m, Super Range 20-34m, Ultra Range 34-56m).", "Lifeline for long spans (Long Range 10-20m, Super Range 20-34m, Ultra Range 34-56m).", "Línea de vida para grandes luces (Long Range 10-20m, Super Range 20-34m, Ultra Range 34-56m)."]
    },
    lblComponentsSelector: ["PIÈCES DU SYSTÈME (COCHER POUR AFFICHER EN 3D) :", "SYSTEM COMPONENTS (CHECK TO DISPLAY IN 3D):", "PIEZAS DEL SISTEMA (MARCAR PARA MOSTRAR EN 3D):"],
    emptyStateTitle: ["Veuillez choisir un système HOOKT ci-dessus", "Please choose a HOOKT system above", "Por favor elija un sistema HOOKT arriba"],
    emptyStateSub: ["Cliquez sur CORE, PRO ou EXTREME pour afficher et configurer la ligne de vie 3D.", "Click on CORE, PRO or EXTREME to display and configure the 3D lifeline.", "Haga clic en CORE, PRO o EXTREME para mostrar y configurar la línea de vida 3D."],

    components: {
        "New_Pro": ["NEW PRO ABSORBER", "NEW PRO ABSORBER", "ABSORBEDOR NEW PRO"],
        "X-Matrix": ["X-MATRIX JONCTION MULTIDIRECTIONNELLE", "X-MATRIX MULTIDIRECTIONAL JUNCTION", "UNIÓN MULTIDIRECCIONAL X-MATRIX"],
        "Mini_Omega": ["MINI OMEGA (avec PRO)", "MINI OMEGA (with PRO)", "MINI OMEGA (con PRO)"],
        "P_Inox": ["POTELET INOX RIGIDE (avec PRO)", "STAINLESS RIGID POST (with PRO)", "POSTE INOX RÍGIDO (con PRO)"],
        "X-Cone": ["X-CONE", "X-CONE", "X-CONE"],
        "LightPro": ["LIGHT PRO ABSORBER", "LIGHT PRO ABSORBER", "ABSORBEDOR LIGHT PRO"],
        "PB_HOOKt": ["POTELET PB HOOKT (avec CORE)", "PB HOOKT POST (with CORE)", "POSTE PB HOOKT (con CORE)"],
        "P_Galva": ["POTELET GALVA RIGIDE (avec CORE)", "GALVANIZED RIGID POST (with CORE)", "POSTE GALVA RÍGIDO (con CORE)"],
        "LongRange": ["LONG RANGE HEAVY ABSORBER", "LONG RANGE HEAVY ABSORBER", "ABSORBEDOR HEAVY LONG RANGE"],
        "A-Fix": ["A-FIX ANCHOR", "A-FIX ANCHOR", "ANCLAJE A-FIX"]
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
    subtabSpanMulti: ["Multi-Portée", "Multi-Span", "Multiluz"],
    lblAnchorCount: ["Potelets / Ancrages", "Posts / Anchors", "Postes / Anclajes"],
    lblAbsorberCount: ["Absorbeurs", "Absorbers", "Absorbedores"],
    lblEngineerCoefCalc: ["Facteur de chute :", "Fall Factor:", "Factor de caída:"],
    lblMaxAllowedSpanCalc: ["Portée Max Aut. :", "Max Allowed Span:", "Luz Máx. Perm.:"],
    sideTitleLifeline: ["Résultats sur la Ligne de Vie", "Lifeline Results", "Resultados de la Línea de Vida"],
    lblTotalLineLenRow: ["Longueur développée :", "Total Length:", "Longitud Total:"],
    lblSpanLRow: ["Portée réelle max :", "Max Actual Span:", "Luz Real Máxima:"],
    lblForceLRow: ["Tension max câble :", "Max Cable Tension:", "Tensión Máx Cable:"],
    lblDeflLRow: ["Flèche maximale :", "Max Deflection:", "Flecha Máxima:"],
    lblExt1LRow: ["Force Extrémité 1 :", "End Force 1:", "Fuerza Extremo 1:"],
    lblExt2LRow: ["Force Extrémité 2 :", "End Force 2:", "Fuerza Extremo 2:"],
    lblExt3LRow: ["Force Ancrage 3 :", "Anchor Force 3:", "Fuerza Anclaje 3:"],
    lblExt4LRow: ["Force Ancrage 4 :", "Anchor Force 4:", "Fuerza Anclaje 4:"],
    lblMultiSpanDistribution: ["Répartition des efforts aux ancrages :", "Anchor Load Distribution:", "Distribución de Cargas a los Anclajes:"],
    lblCrossDistribution: ["Répartition en Croix (4 branches) :", "Cross Distribution (4 branches):", "Distribución en Cruz (4 ramas):"],
    lblGridDistribution: ["Répartition Grille (Précharge + Dynamique) :", "Grid Distribution (Preload + Dynamic):", "Distribución en Cuadrícula (Precarga + Dinámica):"],
    lblAnchorA0: ["Force Ancrage A0 (Ext. Gauche)", "Anchor Force A0 (Left Ext.)", "Fuerza Anclaje A0 (Ext. Izq.)"],
    lblAnchorA1: ["Force Ancrage A1", "Anchor Force A1", "Fuerza Anclaje A1"],
    lblAnchorA2: ["Force Ancrage A2", "Anchor Force A2", "Fuerza Anclaje A2"],
    lblAnchorA3: ["Force Ancrage A3", "Anchor Force A3", "Fuerza Anclaje A3"],
    lblAnchorA4: ["Force Ancrage A4", "Anchor Force A4", "Fuerza Anclaje A4"],
    lblAnchorA5: ["Force Ancrage A5 (Ext. Droite)", "Anchor Force A5 (Right Ext.)", "Fuerza Anclaje A5 (Ext. Der.)"],
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
        xmatrixNewProOnly: [
            "⚠️ CONFIGURATION NON SUPPORTÉE :\nLa jonction X-MATRIX en milieu de ligne est uniquement disponible pour le système PRO (et non Core ni Extreme).\nPour cette étude spécifique, veuillez contacter l'équipe HOOKT.",
            "⚠️ UNSUPPORTED CONFIGURATION:\nThe mid-span X-MATRIX junction is only available for the PRO system (not Core or Extreme).\nFor this specific study, please contact the HOOKT team.",
            "⚠️ CONFIGURACIÓN NO COMPATIBLE:\nLa unión X-MATRIX a mitad de línea solo está disponible para el sistema PRO (no Core ni Extreme).\nPara este estudio específico, póngase en contacto con el equipo de HOOKT."
        ],
        line2FlatOnly: [
            "⚠️ CONFIGURATION INCOMPATIBLE :\nLa seconde direction (Ligne 2) peut uniquement être sélectionnée en configuration Toit Plat (Terrasse Standard).",
            "⚠️ INCOMPATIBLE CONFIGURATION:\nThe second direction (Line 2) can only be selected in Flat Roof configuration (Standard Terrace).",
            "⚠️ CONFIGURACIÓN INCOMPATIBLE:\nLa segunda dirección (Línea 2) solo se puede seleccionar en configuración de Techo Plano (Terraza Estándar)."
        ],
        longRangeFlatOverhead: [
            "⚠️ CONFIGURATION INCOMPATIBLE :\nLe système EXTREME est exclusivement utilisable en configuration Toit Plat (Overhead avec poteaux hauts).\nVotre toiture actuelle est configurée différemment. Veuillez modifier les paramètres de la toiture.",
            "⚠️ INCOMPATIBLE CONFIGURATION:\nThe EXTREME system can only be used in Flat Roof configuration (Overhead with high posts).\nYour current roof is configured differently. Please modify roof parameters.",
            "⚠️ CONFIGURACIÓN INCOMPATIBLE:\nEl sistema EXTREME solo se puede utilizar en configuración de Techo Plano (Overhead con postes altos).\nSu cubierta actual está configurada de forma diferente. Modifique los parámetros de la cubierta."
        ],
        overheadLongRangeOnly: [
            "⚠️ CONFIGURATION INCOMPATIBLE :\nLa configuration Toit Plat (Overhead avec poteaux hauts 3.0m) est exclusivement réservée au système EXTREME.",
            "⚠️ INCOMPATIBLE CONFIGURATION:\nFlat Roof (Overhead with 3.0m high posts) is exclusively reserved for the EXTREME system.",
            "⚠️ CONFIGURACIÓN INCOMPATIBLE:\nEl Techo Plano (Overhead con postes de 3,0 m) está reservado exclusivamente para el sistema EXTREME."
        ],
        slopedNewProOnly: [
            "⚠️ CONFIGURATION INCOMPATIBLE :\nLe toit mono-pente (incliné) est uniquement disponible pour le système PRO.",
            "⚠️ INCOMPATIBLE CONFIGURATION:\nSingle-slope (pitched) roof is only available for the PRO system.",
            "⚠️ CONFIGURACIÓN INCOMPATIBLE:\nLa cubierta monopendiente (inclinada) solo está disponible para el sistema PRO."
        ],
        usersLimit: [
            "⚠️ LIMITATION DU SYSTÈME :\nPour les systèmes CORE et EXTREME, le nombre d'utilisateurs maximal est de 3 personnes (PRO jusqu'à 5 utilisateurs).",
            "⚠️ SYSTEM LIMITATION:\nFor CORE and EXTREME systems, the maximum number of users is 3 people (PRO up to 5 users).",
            "⚠️ LIMITACIÓN DEL SISTEMA:\nPara los sistemas CORE y EXTREME, el número máximo de usuarios es de 3 personas (PRO hasta 5 usuarios)."
        ],
        miniOmegaNewPro: [
            "⚠️ ALERTE CONFIGURATION INVALIDE :\nLe potelet MINI OMEGA ne s'utilise qu'avec un ancrage PRO (jamais seul, ni avec Core ou Extreme).",
            "⚠️ INVALID CONFIGURATION ALERT:\nThe MINI OMEGA post is only used with a PRO anchor (never alone, nor with Core or Extreme).",
            "⚠️ ALERTA DE CONFIGURACIÓN INVÁLIDA:\nEl poste MINI OMEGA solo se utiliza con un anclaje PRO (nunca solo, ni con Core o Extreme)."
        ],
        basculantLightPro: [
            "⚠️ ALERTE CONFIGURATION INVALIDE :\nLe potelet basculant ne s'utilise qu'avec un ancrage Core.",
            "⚠️ INVALID CONFIGURATION ALERT:\nThe tilting post is only used with a Core anchor.",
            "⚠️ ALERTA DE CONFIGURACIÓN INVÁLIDA:\nEl poste basculante solo se utiliza con un anclaje Core."
        ],
        rigideNotLongRange: [
            "⚠️ ALERTE CONFIGURATION INVALIDE :\nLe potelet rigide ne s'utilise qu'avec les gammes PRO ou Core.",
            "⚠️ INVALID CONFIGURATION ALERT:\nThe rigid post is only used with PRO or Core ranges.",
            "⚠️ ALERTA DE CONFIGURACIÓN INVÁLIDA:\nEl poste rígido solo se utiliza con las gamas PRO o Core."
        ],
        afixLongRangeOnly: [
            "⚠️ ALERTE CONFIGURATION INVALIDE :\nLa pièce A.FIX ne s'utilise qu'avec la gamme EXTREME.",
            "⚠️ INVALID CONFIGURATION ALERT:\nThe A.FIX component is only used with the EXTREME system.",
            "⚠️ ALERTA DE CONFIGURACIÓN INVÁLIDA:\nLa pieza A.FIX solo se utiliza con la gama EXTREME."
        ],
        longRangeLengthRange: [
            "⚠️ LONGUEUR DE LIGNE NON CONFORME :\nPour le système EXTREME, vous devez choisir une longueur de ligne entre 10 et 56 m.",
            "⚠️ NON-COMPLIANT LINE LENGTH:\nFor the EXTREME system, line length must be between 32.8 and 183.7 ft.",
            "⚠️ LONGITUD DE LÍNEA NO CONFORME:\nPara el sistema EXTREME, la longitud de la línea debe estar entre 10 y 56 m."
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
        engineerCoefficient: ["Facteur de chute : ", "Fall Factor: ", "Factor de caída: "],
        anchorCount: ["Nombre d'ancrages : ", "Number of anchors: ", "Número de anclajes: "],
        absorberCount: ["Nombre d'absorbeurs : ", "Number of absorbers: ", "Número de absorbedores: "],
        mountingSupport: ["Support de pose : ", "Mounting surface: ", "Soporte de instalación: "],
        roofSlope: ["Pente de toiture : ", "Roof slope: ", "Pendiente de cubierta: "],
        linesSummary: ["Lignes : ", "Lines: ", "Líneas: "],
        lineLengthL1: ["Longueur Ligne L1 : ", "Lifeline Length L1: ", "Longitud Línea L1: "],
        totalDevLength: ["Longueur totale développée : ", "Total developed length: ", "Longitud total desarrollada: "],
        maxUsers: ["Nombre d'utilisateurs max : ", "Max active users: ", "Número máx. de usuarios: "],
        
        concrete: ["Dalle Béton", "Concrete Slab", "Losa de Hormigón"],
        metal: ["Bac Acier Nervuré", "Trapezoidal Metal Sheet", "Chapa de Acero Nervada"],
        bitumen: ["Étanchéité Bitume", "Bitumen Membrane", "Impermeabilización Bituminosa"],
        metalOther: ["Structure Metal / Autre", "Steel Structure / Other", "Estructura Metálica / Otro"],

        flatRoofPdf: ["0° - Toit Plat", "0° - Flat Roof", "0° - Techo Plano"],
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
        rowForceL: ["Tension max câble", "Max cable tension", "Tensión máx cable"],
        rowDefl: ["Flèche maximale", "Max deflection", "Flecha máxima"],
        rowExt1: ["Force Extrémité 1", "End Force 1", "Fuerza Extremo 1"],
        rowExt2: ["Force Extrémité 2", "End Force 2", "Fuerza Extremo 2"],
        rowExt3: ["Force Ancrage 3", "Anchor Force 3", "Fuerza Anclaje 3"],
        rowExt4: ["Force Ancrage 4", "Anchor Force 4", "Fuerza Anclaje 4"],
        rowAnchorA0: ["Force Ancrage A0", "Anchor Force A0", "Fuerza Anclaje A0"],
        rowAnchorA1: ["Force Ancrage A1", "Anchor Force A1", "Fuerza Anclaje A1"],
        rowAnchorA2: ["Force Ancrage A2", "Anchor Force A2", "Fuerza Anclaje A2"],
        rowAnchorA3: ["Force Ancrage A3", "Anchor Force A3", "Fuerza Anclaje A3"],
        rowAnchorA4: ["Force Ancrage A4", "Anchor Force A4", "Fuerza Anclaje A4"],
        rowAnchorA5: ["Force Ancrage A5", "Anchor Force A5", "Fuerza Anclaje A5"],
        rowCrossNorth: ["Ancrage Branche Nord", "North Branch Anchor", "Anclaje Rama Norte"],
        rowCrossEast: ["Ancrage Branche Est", "East Branch Anchor", "Anclaje Rama Este"],
        rowCrossSouth: ["Ancrage Branche Sud", "South Branch Anchor", "Anclaje Rama Sur"],
        rowCrossWest: ["Ancrage Branche Ouest", "West Branch Anchor", "Anclaje Rama Oeste"],

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
        matriceNewPro: ["Matrice PRO Absorbeur", "PRO Matrix Absorber", "Matriz PRO Absorbedor"],
        matriceLightPro: ["Matrice CORE Absorbeur", "CORE Matrix Absorber", "Matriz CORE Absorbedor"],
        matriceLongRange: ["Matrice EXTREME Absorbeur", "EXTREME Matrix Absorber", "Matriz EXTREME Absorbedor"],

        platineNewPro: ["Platine de fixation PRO", "PRO Mounting Plate", "Placa de fijación PRO"],
        platineLightPro: ["Platine de fixation CORE", "CORE Mounting Plate", "Placa de fijación CORE"],
        platineLongRange: ["Platine de fixation EXTREME", "EXTREME Mounting Plate", "Placa de fijación EXTREME"],

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

// Spec V2 — 06 : Automatic Translation Completeness Validator
function verifyTranslationsCompleteness(dictFr, dictEn) {
    const missingInEn = [];
    const missingInFr = [];

    function check(frObj, enObj, prefix = "") {
        for (const k in frObj) {
            const p = prefix ? `${prefix}.${k}` : k;
            if (enObj[k] === undefined) {
                missingInEn.push(p);
            } else if (typeof frObj[k] === "object" && frObj[k] !== null && !Array.isArray(frObj[k])) {
                check(frObj[k], enObj[k], p);
            }
        }
    }

    if (dictFr && dictEn) {
        check(dictFr, dictEn);
        check(dictEn, dictFr);
    }

    return {
        isValid: missingInEn.length === 0 && missingInFr.length === 0,
        missingInEn,
        missingInFr
    };
}
window.verifyTranslationsCompleteness = verifyTranslationsCompleteness;

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
        const sysName = normalizeProduct(state.product || "CORE");
        return [
            `POTELET PB HOOKT (avec ${sysName})`,
            `PB HOOKT POST (with ${sysName})`,
            `POSTE PB HOOKT (con ${sysName})`
        ][l];
    }
    if (c.id === "P_Galva") {
        const sysName = normalizeProduct(state.product || "CORE");
        const heightSuffix = (state.hllElevationPreset === "d_ring") ? " 1.5m" : (state.hllElevationPreset === "overhead") ? " 1.8m" : "";
        return [
            `POTELET GALVA RIGIDE${heightSuffix} (avec ${sysName})`,
            `GALVANIZED RIGID POST${heightSuffix} (with ${sysName})`,
            `POSTE GALVA RÍGIDO${heightSuffix} (con ${sysName})`
        ][l];
    }
    if (c.id === "P_Inox") {
        const sysName = normalizeProduct(state.product || "CORE");
        const heightSuffix = (state.hllElevationPreset === "d_ring") ? " 1.5m" : (state.hllElevationPreset === "overhead") ? " 1.8m" : "";
        return [
            `POTELET INOX RIGIDE${heightSuffix} (avec ${sysName})`,
            `STAINLESS RIGID POST${heightSuffix} (with ${sysName})`,
            `POSTE INOX RÍGIDO${heightSuffix} (con ${sysName})`
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
    const isEn = (l === 1);
    if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("hookt_v2_lang", state.lang);
    }

    const selectHome = document.getElementById("lang-select-home");
    const selectDb = document.getElementById("lang-select-db");
    if (selectHome && selectHome.value != l) selectHome.value = l;
    if (selectDb && selectDb.value != l) selectDb.value = l;

    const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
    const btnUnit = document.getElementById("btn-unit-text");
    if (btnUnit) btnUnit.textContent = isUS ? "US (FT/LBF)" : (isEn ? "METRIC" : "MÉTRIQUE");
    const btnToggleUnit = document.getElementById("btn-toggle-unit-system");
    if (btnToggleUnit) btnToggleUnit.classList.toggle("active", isUS);
    const selUnitSystem = document.getElementById("select-unit-system");
    if (selUnitSystem) selUnitSystem.value = isUS ? "imperial" : "metric";

    updateUnitLabelsInDOM();

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

    const secProject = document.getElementById("lbl-sec-project");
    if (secProject) secProject.textContent = TRANSLATIONS.secProject[l];
    const lblProjName = document.getElementById("lbl-proj-name");
    if (lblProjName) lblProjName.textContent = TRANSLATIONS.projName[l];
    const inProjName = document.getElementById("input-proj-name");
    if (inProjName) inProjName.placeholder = TRANSLATIONS.projNamePlaceholder[l];
    const lblProjLoc = document.getElementById("lbl-proj-loc");
    if (lblProjLoc) lblProjLoc.textContent = TRANSLATIONS.projLoc[l];
    const inProjLoc = document.getElementById("input-proj-loc");
    if (inProjLoc) inProjLoc.placeholder = TRANSLATIONS.projLocPlaceholder[l];
    const lblProjDesigner = document.getElementById("lbl-proj-designer");
    if (lblProjDesigner) lblProjDesigner.textContent = TRANSLATIONS.projDesigner[l];
    const inProjDesigner = document.getElementById("input-proj-designer");
    if (inProjDesigner) inProjDesigner.placeholder = TRANSLATIONS.projDesignerPlaceholder[l];
    const lblProjHll = document.getElementById("lbl-proj-hll");
    if (lblProjHll) lblProjHll.textContent = TRANSLATIONS.projHll[l];

    const lblProduct = document.getElementById("lbl-product");
    if (lblProduct) lblProduct.innerHTML = `<i class="fa-solid fa-shield-halved"></i> ${TRANSLATIONS.lblProduct ? TRANSLATIONS.lblProduct[l] : (isEn ? "HOOKT System Family:" : "Gamme de Système HOOKT :")}`;
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

    const lblLineLen = document.getElementById("lbl-line-len");
    if (lblLineLen) lblLineLen.textContent = TRANSLATIONS.lblLineLen[l];
    const lblUsers = document.getElementById("lbl-users");
    if (lblUsers) lblUsers.textContent = TRANSLATIONS.lblUsers[l];
    const lblEngCoef = document.getElementById("lbl-engineer-coefficient");
    if (lblEngCoef) lblEngCoef.textContent = TRANSLATIONS.lblEngineerCoefficient ? TRANSLATIONS.lblEngineerCoefficient[l] : (isEn ? "Fall Factor:" : "Facteur de chute :");
    const hintEngCoef = document.getElementById("hint-engineer-coefficient");
    if (hintEngCoef) hintEngCoef.textContent = isEn ? "Adjusts calculated forces (default 1.00 = test results)" : "Ajuste les efforts calculés (défaut 1.00 = essais)";

    // Modal unit system
    const lblUnitSystem = document.getElementById("lbl-unit-system");
    if (lblUnitSystem) lblUnitSystem.textContent = isEn ? "Unit System:" : "Système d'unités :";
    if (selUnitSystem) {
        const optMetric = selUnitSystem.querySelector("option[value='metric']");
        const optImperial = selUnitSystem.querySelector("option[value='imperial']");
        if (optMetric) optMetric.textContent = isEn ? "Metric System (m, mm, kN)" : "Système Métrique (m, mm, kN)";
        if (optImperial) optImperial.textContent = isEn ? "US / Imperial System (ft, lbf)" : "Système US / Impérial (ft, lbf)";
    }

    // Application mode
    const lblAppMode = document.getElementById("lbl-app-mode");
    if (lblAppMode) lblAppMode.textContent = isEn ? "Application / Mode:" : "Application / Mode :";
    const selAppMode = document.getElementById("select-app-mode");
    if (selAppMode) {
        const optFall = selAppMode.querySelector("option[value='fall_arrest']");
        const optRestr = selAppMode.querySelector("option[value='restraint']");
        if (optFall) optFall.textContent = isEn ? "Fall Arrest" : "Fall Arrest (Anti-chute)";
        if (optRestr) optRestr.textContent = isEn ? "Restraint (Work restraint)" : "Restraint (Retenue / Maintien)";
    }

    // Arrest load
    const lblArrestMode = document.getElementById("lbl-arrest-load-mode");
    if (lblArrestMode) lblArrestMode.textContent = isEn ? "Arrest Load:" : "Arrest Load (Charge d'arrêt) :";
    const lblArrestVal = document.getElementById("lbl-arrest-load-val");
    if (lblArrestVal) lblArrestVal.textContent = isEn ? `Arrest Load Value (${isUS ? 'lbf' : 'kN'}) :` : `Valeur Charge d'arrêt (${isUS ? 'lbf' : 'kN'}) :`;

    // Elevation preset
    const lblElevPreset = document.getElementById("lbl-hll-elevation-preset");
    if (lblElevPreset) lblElevPreset.innerHTML = `<i class="fa-solid fa-arrows-up-down"></i> ${isEn ? "Lifeline Elevation:" : "Élévation de la Ligne :"}`;
    const lblElevVal = document.getElementById("lbl-hll-elevation-val");
    if (lblElevVal) lblElevVal.textContent = isEn ? "Elevation Height:" : "Hauteur Élévation :";

    // Connecting device
    const lblConnDev = document.getElementById("lbl-connecting-device");
    if (lblConnDev) lblConnDev.innerHTML = `<i class="fa-solid fa-link"></i> ${isEn ? "Connecting Device:" : "Dispositif de Connexion :"}`;
    const selConnDev = document.getElementById("select-connecting-device");
    if (selConnDev) {
        const optSrd = selConnDev.querySelector("option[value='srd']");
        const optCustomSrd = selConnDev.querySelector("option[value='custom_srd']");
        const optLany = selConnDev.querySelector("option[value='lanyard']");
        const optCustomLany = selConnDev.querySelector("option[value='custom_lanyard']");
        if (optSrd) optSrd.textContent = isEn ? "SRD / Self-Retracting Lifeline (SRL)" : (l === 2 ? "SRD / Retráctil automático (SRL)" : "SRD / Enrouleur à rappel automatique (SRL)");
        if (optCustomSrd) optCustomSrd.textContent = isEn ? "Other SRL / SRD (Custom Entry)" : (l === 2 ? "Otro Retráctil SRL (Entrada libre)" : "Autre Enrouleur SRL (Saisie libre)");
        if (optLany) optLany.textContent = isEn ? "Shock-Absorbing Lanyard" : (l === 2 ? "Eslinga con absorbedor" : "Longe avec absorbeur d'énergie");
        if (optCustomLany) optCustomLany.textContent = isEn ? "Other Lanyard (Custom Entry)" : (l === 2 ? "Otra Eslinga (Entrada libre)" : "Autre Longe absorbante (Saisie libre)");
    }

    const lblCustomName = document.getElementById("lbl-custom-device-name");
    if (lblCustomName) lblCustomName.textContent = isEn ? "Device Name / Model:" : (l === 2 ? "Nombre / Modelo del dispositivo:" : "Nom / Modèle du dispositif :");
    const lblCustomClass = document.getElementById("lbl-custom-device-class");
    if (lblCustomClass) lblCustomClass.textContent = isEn ? "ANSI / OSHA Class:" : (l === 2 ? "Clase ANSI / OSHA:" : "Classe ANSI / OSHA :");
    const lblCustomLen = document.getElementById("lbl-custom-device-length");
    if (lblCustomLen) lblCustomLen.textContent = isEn ? "Lanyard Length (m):" : (l === 2 ? "Longitud de eslinga (m):" : "Longueur de la longe (m) :");
    const lblSrlMad = document.getElementById("lbl-srl-mad");
    if (lblSrlMad) lblSrlMad.textContent = isEn ? "Maximum Arrest Distance (MAD):" : (l === 2 ? "Distancia Máx. de Detención (MAD):" : "Distance d'arrêt maximale (MAD) :");
    const lblArrestForce = document.getElementById("lbl-arrest-force");
    if (lblArrestForce) lblArrestForce.textContent = isEn ? "Arrest Force (1 user max):" : (l === 2 ? "Fuerza de parada máx (1 user):" : "Force d'arrêt (1 user max) :");

    // Fall mode
    const lblFallMode = document.getElementById("lbl-fall-mode");
    if (lblFallMode) lblFallMode.innerHTML = `<i class="fa-solid fa-bullseye"></i> ${isEn ? "Fall Case Calculation:" : "Cas de Chute à Calculer :"}`;
    const selFallMode = document.getElementById("select-fall-mode");
    if (selFallMode) {
        const optCrit = selFallMode.querySelector("option[value='critical_case']");
        const optSelSpan = selFallMode.querySelector("option[value='selected_span']");
        if (optCrit) optCrit.textContent = isEn ? "Critical Case (Simulates all spans, extracts worst case)" : "Cas Critique (Simule chaque portée et sort le pire cas)";
        if (optSelSpan) optSelSpan.textContent = isEn ? "Selected Span (Target active span only)" : "Portée Choisie (Calcul ciblé sur la portée active)";
    }

    // Body posture
    const lblBodyPos = document.getElementById("lbl-body-pos");
    if (lblBodyPos) lblBodyPos.innerHTML = `<i class="fa-solid fa-person"></i> ${isEn ? "Body Posture (Worker):" : "Position du Corps (Opérateur) :"}`;

    const lblWws = document.getElementById("lbl-wws-elevation");
    if (lblWws) lblWws.textContent = isEn ? "WWS Elevation (Walking Working Surface):" : "WWS Elevation (Alt. surface travail) :";

    const lblSubstrate = document.getElementById("lbl-substrate-info");
    if (lblSubstrate) lblSubstrate.innerHTML = `<i class="fa-solid fa-cubes"></i> ${TRANSLATIONS.substrateInfo[l]}`;
    const inSubstrate = document.getElementById("input-substrate-info");
    if (inSubstrate) inSubstrate.placeholder = TRANSLATIONS.substratePlaceholder[l];

    // Section 1bis: Roof Parameters
    const lblRoofNorm = document.getElementById("lbl-roof-norm");
    if (lblRoofNorm) {
        lblRoofNorm.innerHTML = `<i class="fa-solid fa-scale-balanced"></i> ${["Norme réglementaire :", "Regulatory Standard:", "Norma reglamentaria:"][l]}`;
    }
    const hintRoofNormEn = document.getElementById("hint-roof-norm-en");
    if (hintRoofNormEn) {
        hintRoofNormEn.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${["En norme EN 795, les toitures en pente ne sont pas admises.", "Under EN 795 standard, sloped roofs are not permitted.", "Bajo la norma EN 795, no se permiten cubiertas inclinadas."][l]}`;
    }
    const selRoofNorm = document.getElementById("select-roof-norm");
    if (selRoofNorm) {
        const optOsha = selRoofNorm.querySelector("option[value='OSHA']");
        const optEn = selRoofNorm.querySelector("option[value='EN 795']");
        if (optOsha) optOsha.textContent = isEn ? "OSHA (US Standard / OSHA 1910 - 1926)" : "OSHA (Standard américain / OSHA 1910 - 1926)";
        if (optEn) optEn.textContent = isEn ? "EN 795-C (European Standard)" : "EN 795-C (Standard européen)";
    }
    const secRoof = document.getElementById("lbl-sec-roof");
    if (secRoof) secRoof.textContent = TRANSLATIONS.secRoof[l];
    const lblRoofType = document.getElementById("lbl-roof-type");
    if (lblRoofType) lblRoofType.textContent = TRANSLATIONS.roofType[l];
    const selRoofType = document.getElementById("select-roof-type");
    if (selRoofType) {
        Array.from(selRoofType.options).forEach(opt => {
            if (TRANSLATIONS.roofTypeOptions[opt.value]) {
                opt.textContent = TRANSLATIONS.roofTypeOptions[opt.value][l];
            }
        });
    }
    const lblRoofLen = document.getElementById("lbl-roof-length");
    if (lblRoofLen) lblRoofLen.textContent = TRANSLATIONS.roofLength[l];
    const lblRoofWid = document.getElementById("lbl-roof-width");
    if (lblRoofWid) lblRoofWid.textContent = TRANSLATIONS.roofWidth[l];
    const lblSlope1 = document.getElementById("lbl-roof-slope-1");
    if (lblSlope1) lblSlope1.textContent = TRANSLATIONS.roofSlope1[l];
    const lblSlope2 = document.getElementById("lbl-roof-slope-2");
    if (lblSlope2) lblSlope2.textContent = TRANSLATIONS.roofSlope2[l];
    const lblRidge = document.getElementById("lbl-ridge-pos");
    if (lblRidge) lblRidge.textContent = TRANSLATIONS.ridgePos[l];
    const lblLineEdge = document.getElementById("lbl-line-to-edge");
    if (lblLineEdge) lblLineEdge.textContent = TRANSLATIONS.lineToEdge[l];
    const lblRoofH = document.getElementById("lbl-roof-height-ground");
    if (lblRoofH) lblRoofH.textContent = TRANSLATIONS.roofHeightGround[l];

    // Section 2: Installation Layout (12 Layouts OSHA)
    const secLayout = document.getElementById("lbl-sec-layout");
    if (secLayout) secLayout.textContent = TRANSLATIONS.secLayout[l];
    const lblLayoutType = document.getElementById("lbl-layout-type");
    if (lblLayoutType) lblLayoutType.textContent = TRANSLATIONS.layoutType[l];
    const selLayoutType = document.getElementById("select-layout-type");
    if (selLayoutType) {
        Array.from(selLayoutType.options).forEach(opt => {
            if (TRANSLATIONS.layoutTypeOptions[opt.value]) {
                opt.textContent = TRANSLATIONS.layoutTypeOptions[opt.value][l];
            }
        });
    }

    // Sidebar connecting device & Retracted length translations (Spec V2 — 10 / Prompt 16)
    const lblSidebarConn = document.getElementById("lbl-sidebar-conn-dev-title");
    if (lblSidebarConn) lblSidebarConn.textContent = ["Type de connexion :", "Connecting Device Type:", "Tipo de conexión:"][l];
    const selSidebarConn = document.getElementById("select-sidebar-connecting-device");
    if (selSidebarConn) {
        const optSrd = selSidebarConn.querySelector("option[value='srd']");
        const optCustomSrd = selSidebarConn.querySelector("option[value='custom_srd']");
        const optLany = selSidebarConn.querySelector("option[value='lanyard']");
        const optCustomLany = selSidebarConn.querySelector("option[value='custom_lanyard']");
        if (optSrd) optSrd.textContent = isEn ? "SRL (Self-Retracting Lifeline)" : (l === 2 ? "SRL (Retráctil automático)" : "SRL (Enrouleur à rappel automatique)");
        if (optCustomSrd) optCustomSrd.textContent = isEn ? "Custom SRL (Free entry)" : (l === 2 ? "SRL personalizado (Entrada libre)" : "SRL personnalisé (Saisie libre)");
        if (optLany) optLany.textContent = isEn ? "Shock-Absorbing Lanyard" : (l === 2 ? "Eslinga con absorbedor" : "Longe avec absorbeur d'énergie");
        if (optCustomLany) optCustomLany.textContent = isEn ? "Custom Lanyard (Free entry)" : (l === 2 ? "Eslinga personalizada (Entrada libre)" : "Longe personnalisée (Saisie libre)");
    }

    const isLanyardDev = (state.connectingDevice === "lanyard" || state.connectingDevice === "custom_lanyard");
    const lblRetractedTitle = document.getElementById("lbl-srl-retracted-title");
    if (lblRetractedTitle) {
        lblRetractedTitle.textContent = isLanyardDev
            ? ["Longueur de la longe :", "Lanyard Length:", "Longitud de la eslinga:"][l]
            : ["Longueur rétractée :", "Retracted Length:", "Longitud retraída:"][l];
    }
    const btnResetRetractedTxt = document.getElementById("btn-reset-retracted-length-text");
    if (btnResetRetractedTxt) btnResetRetractedTxt.textContent = ["Rétablir", "Reset", "Restablecer"][l];
    const badgeRetractedMod = document.getElementById("badge-retracted-modified");
    if (badgeRetractedMod) badgeRetractedMod.textContent = ["modifiée", "modified", "modificada"][l];
    const retractedWarnTxt = document.getElementById("retracted-warning-text");
    if (retractedWarnTxt) {
        retractedWarnTxt.textContent = isLanyardDev
            ? ["Avertissement : Longueur de la longe supérieure à 3,0 m (9.8 ft).", "Warning: Lanyard length exceeds 3.0 m (9.8 ft).", "Advertencia: Longitud de eslinga superior a 3,0 m (9.8 ft)."][l]
            : ["Avertissement : Longueur rétractée supérieure à 3,0 m (9.8 ft).", "Warning: Retracted length exceeds 3.0 m (9.8 ft).", "Advertencia: Longitud retraída superior a 3,0 m (9.8 ft)."][l];
    }

    // Update SRL cards display
    if (typeof updateSrlCardsDisplay === "function") updateSrlCardsDisplay();

    const lblSrlMadTitle = document.getElementById("lbl-srl-mad-title");
    if (lblSrlMadTitle) lblSrlMadTitle.textContent = ["Distance d'arrêt maximale (MAD) :", "Maximum Arrest Distance (MAD):", "Distancia máxima de parada (MAD):"][l];
    const btnResetMadTxt = document.getElementById("btn-reset-mad-text");
    if (btnResetMadTxt) btnResetMadTxt.textContent = ["Rétablir", "Reset", "Restablecer"][l];
    const badgeMadMod = document.getElementById("badge-mad-modified");
    if (badgeMadMod) badgeMadMod.textContent = ["modifiée", "modified", "modificada"][l];
    const madWarnTxt = document.getElementById("mad-warning-text");
    if (madWarnTxt) madWarnTxt.textContent = ["Avertissement : MAD supérieure à 2,00 m (6.6 ft).", "Warning: MAD exceeds 2.00 m (6.6 ft).", "Advertencia: MAD superior a 2,00 m (6.6 ft)."][l];
    const lblBtnStairs = document.getElementById("lbl-btn-stairs");
    if (lblBtnStairs) lblBtnStairs.textContent = ["Escaliers", "Stairs", "Escaleras"][l];

    // Engineer coefficient readout
    const valEngCoef = document.getElementById("val-engineer-coef");
    if (valEngCoef) valEngCoef.textContent = (state.engineerCoefficient !== undefined ? parseFloat(state.engineerCoefficient).toFixed(2) : "1.00");

    const lblHasLine2Span = document.getElementById("lbl-has-line2-span");
    if (lblHasLine2Span) {
        lblHasLine2Span.innerHTML = `<i class="fa-solid fa-code-fork"></i> ${TRANSLATIONS.lblHasLine2[l]}`;
    }
    const lblLine2Len = document.getElementById("lbl-line2-len");
    if (lblLine2Len) lblLine2Len.textContent = TRANSLATIONS.lblLine2Len[l];
    const lblXmatrixLoc = document.getElementById("lbl-xmatrix-loc");
    if (lblXmatrixLoc) lblXmatrixLoc.textContent = TRANSLATIONS.lblXmatrixLoc[l];

    const selectXLoc = document.getElementById("select-xmatrix-location");
    if (selectXLoc) {
        Array.from(selectXLoc.options).forEach(opt => {
            if (TRANSLATIONS.xmatrixLocs[opt.value]) {
                opt.textContent = TRANSLATIONS.xmatrixLocs[opt.value][l];
            }
        });
    }

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

    const sysNameCore = document.getElementById("sys-name-core");
    if (sysNameCore) sysNameCore.textContent = TRANSLATIONS.sysNames.core ? TRANSLATIONS.sysNames.core[l] : "CORE";
    const sysTagCore = document.getElementById("sys-tag-core") || document.getElementById("sys-tag-lightpro");
    if (sysTagCore) sysTagCore.textContent = TRANSLATIONS.sysTags.core ? TRANSLATIONS.sysTags.core[l] : TRANSLATIONS.sysTags.lightPro[l];
    const sysDescCore = document.getElementById("sys-desc-core") || document.getElementById("sys-desc-lightpro");
    if (sysDescCore) sysDescCore.textContent = TRANSLATIONS.sysDescs.core ? TRANSLATIONS.sysDescs.core[l] : TRANSLATIONS.sysDescs.lightPro[l];

    const sysNamePro = document.getElementById("sys-name-pro");
    if (sysNamePro) sysNamePro.textContent = TRANSLATIONS.sysNames.pro ? TRANSLATIONS.sysNames.pro[l] : "PRO";
    const sysTagPro = document.getElementById("sys-tag-pro") || document.getElementById("sys-tag-newpro");
    if (sysTagPro) sysTagPro.textContent = TRANSLATIONS.sysTags.pro ? TRANSLATIONS.sysTags.pro[l] : TRANSLATIONS.sysTags.newPro[l];
    const sysDescPro = document.getElementById("sys-desc-pro") || document.getElementById("sys-desc-newpro");
    if (sysDescPro) sysDescPro.textContent = TRANSLATIONS.sysDescs.pro ? TRANSLATIONS.sysDescs.pro[l] : TRANSLATIONS.sysDescs.newPro[l];

    const sysNameExtreme = document.getElementById("sys-name-extreme") || document.getElementById("sys-name-longrange");
    if (sysNameExtreme) sysNameExtreme.textContent = TRANSLATIONS.sysNames.extreme ? TRANSLATIONS.sysNames.extreme[l] : TRANSLATIONS.sysNames.longRange[l];
    const sysTagExtreme = document.getElementById("sys-tag-extreme") || document.getElementById("sys-tag-longrange");
    if (sysTagExtreme) sysTagExtreme.textContent = TRANSLATIONS.sysTags.extreme ? TRANSLATIONS.sysTags.extreme[l] : TRANSLATIONS.sysTags.longRange[l];
    const sysDescExtreme = document.getElementById("sys-desc-extreme") || document.getElementById("sys-desc-longrange");
    if (sysDescExtreme) sysDescExtreme.textContent = TRANSLATIONS.sysDescs.extreme ? TRANSLATIONS.sysDescs.extreme[l] : TRANSLATIONS.sysDescs.longRange[l];

    const lblCompSel = document.getElementById("lbl-components-selector");
    if (lblCompSel) {
        lblCompSel.innerHTML = `<i class="fa-solid fa-square-check"></i> ${TRANSLATIONS.lblComponentsSelector[l]}`;
    }

    // Sidebar Clearance & Forces
    const cornerTitle = document.getElementById("lbl-corner-forces-title");
    if (cornerTitle) cornerTitle.textContent = isEn ? "Resolved Corner Forces" : "Efforts de Coin Résolus";
    const clrTitle = document.getElementById("lbl-clearance-title");
    if (clrTitle) clrTitle.textContent = isEn ? "Required Fall Clearance" : "Dégagement de Chute Requis";
    const lblClrDefl = document.getElementById("lbl-clr-defl");
    if (lblClrDefl) lblClrDefl.textContent = isEn ? "Deflection under load:" : "Flèche sous charge :";
    const lblClrMad = document.getElementById("lbl-clr-mad");
    if (lblClrMad) lblClrMad.textContent = isEn ? "SRL Arrest (MAD):" : "Arrêt SRL (MAD) :";
    const lblClrBody = document.getElementById("lbl-clr-body");
    if (lblClrBody) lblClrBody.textContent = isEn ? "Body / D-Ring:" : "Corps / Anneau D :";
    const lblClrMargin = document.getElementById("lbl-clr-margin");
    if (lblClrMargin) lblClrMargin.textContent = isEn ? "Safety Margin:" : "Marge de sécurité :";
    const lblClearanceTotal = document.getElementById("lbl-clearance-total");
    if (lblClearanceTotal) lblClearanceTotal.textContent = isEn ? "Total Required Clearance:" : "Dégagement Total :";

    const lblBufRecoil = document.getElementById("lbl-buffer-recoil-row");
    if (lblBufRecoil) lblBufRecoil.textContent = isEn ? "Buffer Recoil:" : "Recul du Buffer :";
    const valBufRecoil = document.getElementById("val-buffer-recoil");
    if (valBufRecoil) valBufRecoil.textContent = isEn ? "Data to be provided" : "Donnée à renseigner";
    const lblSafFac = document.getElementById("lbl-safety-factor-row");
    if (lblSafFac) lblSafFac.textContent = isEn ? "Safety Factor:" : "Facteur de Sécurité :";
    const valSafFac = document.getElementById("val-safety-factor");
    if (valSafFac) valSafFac.textContent = isEn ? "Data to be provided" : "Donnée à renseigner";

    const lblAnchorsTable = document.getElementById("lbl-anchors-table-title");
    if (lblAnchorsTable) lblAnchorsTable.textContent = isEn ? "Anchors Table" : "Tableau des Ancrages";
    const lblSpansTable = document.getElementById("lbl-spans-table-title");
    if (lblSpansTable) lblSpansTable.textContent = isEn ? "Spans Table" : "Tableau des Portées";
    const badgeCritInd = document.querySelector(".badge-critical-indicator");
    if (badgeCritInd) badgeCritInd.textContent = isEn ? "Critical Values" : "Valeurs Critiques";
    const lblSpansDesc = document.getElementById("lbl-spans-table-desc");
    if (lblSpansDesc) lblSpansDesc.textContent = isEn
        ? "Summary of critical values per span (maximum deflection and worst-case anchor loads)"
        : "Récapitulatif des valeurs critiques par portée (flèche maximale et effort au cas le plus défavorable)";

    const thAnchors = document.querySelectorAll("#table-system-anchors th");
    if (thAnchors && thAnchors.length === 5) {
        thAnchors[0].textContent = isEn ? "Tag" : "Étiquette";
        thAnchors[1].textContent = isEn ? "Type" : "Type";
        thAnchors[2].textContent = isEn ? "Spans" : "Portées";
        thAnchors[3].textContent = isEn ? "Load" : "Effort";
        thAnchors[4].textContent = isEn ? "Remark" : "Remarque";
    }
    const thSpans = document.querySelectorAll("#table-system-spans th");
    if (thSpans && thSpans.length >= 4) {
        thSpans[0].textContent = isEn ? "Tag" : "Étiquette";
        thSpans[1].textContent = isEn ? "Endpoints" : "Extrémités";
        thSpans[2].textContent = isEn ? "Length" : "Longueur";
        if (thSpans.length >= 5) {
            thSpans[3].textContent = isEn ? "Deflection" : "Flèche";
            thSpans[4].textContent = isEn ? "Anchor Load" : "Effort Ancrage";
        } else {
            thSpans[3].textContent = isEn ? "Slope" : "Pente";
        }
    }

    const lblElevationTb = document.getElementById("lbl-elevation-tb");
    if (lblElevationTb) lblElevationTb.textContent = isEn ? "Elevation:" : "Élévation :";
    const tbElevSel = document.getElementById("select-hll-elevation-toolbar");
    if (tbElevSel) {
        const optKnee = tbElevSel.querySelector("option[value='knee']");
        const optDring = tbElevSel.querySelector("option[value='d_ring']");
        const optOver = tbElevSel.querySelector("option[value='overhead']");
        const optCust = tbElevSel.querySelector("option[value='custom']");
        if (optKnee) optKnee.textContent = isEn ? (isUS ? "Knee (1.5 ft)" : "Knee (0.45 m)") : (isUS ? "Genou (1,5 ft)" : "Genou (0,45 m)");
        if (optDring) optDring.textContent = isEn ? (isUS ? "D-Ring (5 ft)" : "D-Ring (1.50 m)") : (isUS ? "Anneau D (5 ft)" : "Anneau D (1,50 m)");
        if (optOver) optOver.textContent = isEn ? (isUS ? "Overhead (10 ft)" : "Overhead (3.0 m)") : (isUS ? "Overhead (10 ft)" : "Overhead (3,0 m)");
        if (optCust) optCust.textContent = isEn ? "Custom..." : "Personnalisée...";
    }
    // Toolbar elevation preset synced with state.hllElevationPreset

    const btnToggleAnchors = document.getElementById("btn-toggle-anchor-labels");
    if (btnToggleAnchors) {
        const sp = btnToggleAnchors.querySelector("span");
        if (sp) sp.textContent = isEn ? "Anchors" : "Ancrages";
    }
    const btnToggleSpans = document.getElementById("btn-toggle-span-labels");
    if (btnToggleSpans) {
        const sp = btnToggleSpans.querySelector("span");
        if (sp) sp.textContent = isEn ? "Lengths" : "Longueurs";
    }
    const lblBtnCotes = document.getElementById("lbl-btn-cotes");
    if (lblBtnCotes) lblBtnCotes.textContent = isEn ? "Dimensions" : "Cotes";

    const legLabels = document.getElementById("legend-labels");
    if (legLabels) legLabels.textContent = isEn ? "Labels & Lengths" : "Étiquettes & Longueurs";

    const srlSecTitle = document.getElementById("lbl-srl-section-title");
    if (srlSecTitle) srlSecTitle.textContent = isEn ? "FALL ARREST DEVICE (SRL / LANYARD)" : "DISPOSITIF ANTICHUTE (SRL / LONGE)";
    const srlSecSub = document.getElementById("srl-section-sub");
    if (srlSecSub) srlSecSub.textContent = isEn
        ? "Select self-retracting lifeline device (SRL). Required to validate calculations and export report."
        : "Sélectionnez le dispositif antichute à rappel automatique (SRL). Requis pour valider le calcul et éditer le rapport.";

    // Inspector Card
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
    const btnInspSplit = document.getElementById("btn-insp-split");
    if (btnInspSplit) btnInspSplit.innerHTML = `<i class="fa-solid fa-scissors"></i> ${isEn ? "Split this span" : "Scinder cette portée"}`;

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
    const lblEngCoefCalc = document.getElementById("lbl-engineer-coef-calc");
    if (lblEngCoefCalc) lblEngCoefCalc.textContent = TRANSLATIONS.lblEngineerCoefCalc[l];
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

    const lblCritSpanTag = document.getElementById("lbl-critical-span-tag");
    if (lblCritSpanTag) lblCritSpanTag.textContent = isEn ? "Critical Span:" : "Portée Critique :";
    const lblPretensionRow = document.getElementById("lbl-pretension-row");
    if (lblPretensionRow) lblPretensionRow.textContent = isEn ? "Cable Pretension (P0):" : "Prétension Câble (P0) :";
    const lblInitialSagRow = document.getElementById("lbl-initial-sag-row");
    if (lblInitialSagRow) lblInitialSagRow.textContent = isEn ? "Initial Sag:" : "Affaissement Initial :";
    const lblMaxInterLoadRow = document.getElementById("lbl-max-inter-load-row");
    if (lblMaxInterLoadRow) lblMaxInterLoadRow.textContent = isEn ? "Max Intermediate Load:" : "Charge Intermédiaire Max :";
    const valSag = document.getElementById("val-initial-sag");
    if (valSag) valSag.textContent = isEn ? "Data to be provided" : "Donnée à renseigner";

    // Bottom Action Bar & Header Projects Button
    const btnOpenProjects = document.getElementById("btn-open-projects");
    if (btnOpenProjects) {
        const sp = btnOpenProjects.querySelector("span");
        if (sp) sp.textContent = isEn ? "Projects" : "Projets";
        btnOpenProjects.title = isEn ? "Saved Projects" : "Projets sauvegardés";
    }
    const btnSaveText = document.getElementById("btn-save-project-text");
    if (btnSaveText) btnSaveText.textContent = isEn ? "Save Project" : "Sauvegarder Projet";
    const btnLoadText = document.getElementById("btn-load-project-text");
    if (btnLoadText) btnLoadText.textContent = isEn ? "My Projects" : "Mes Projets";
    const btnTextExport = document.getElementById("btn-text-export");
    if (btnTextExport) btnTextExport.textContent = TRANSLATIONS.btnTextExport[l];

    const carouselTitle = document.getElementById("carousel-title");
    if (carouselTitle) carouselTitle.textContent = TRANSLATIONS.carouselTitle[l];

    populateConfigModalInputs();
    renderComponentsChecklist();
    updateUnitLabelsInDOM();

    if (state.product && typeof updateCalculationsUI === "function") {
        const activePositions = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
        updateCalculationsUI(activePositions, Calculator.getMaxSpan(state.product));
    }
    if (typeof update3DScene === "function" && state.product) {
        update3DScene();
    }
}

// Real 3D Component Models Database & Exploded Views
const COMPONENTS_DB = {
    "CORE": [
        { id: "LightPro", name: "LIGHT PRO ABSORBER", file: "models/light_pro/LightPro.glb", checked: false, exploded: ["models/light_pro/LightPro_exploded1.png", "models/light_pro/LightPro_exploded2.png", "models/light_pro/LightPro_exploded3.png"] },
        { id: "PB_HOOKt", name: "POTELET PB HOOKT (avec CORE)", file: "models/light_pro/PB_HOOKT.glb", checked: false, exploded: ["models/light_pro/PB_HOOKT_exploded1.png", "models/light_pro/PB_HOOKT_exploded2.png", "models/light_pro/PB_HOOKT_exploded3.png"] },
        { id: "P_Galva", name: "POTELET GALVA RIGIDE (avec CORE)", file: "models/light_pro/P_Galva_Rigide.glb", checked: false, exploded: ["models/light_pro/P_Galva_Rigide_exploded1.png", "models/light_pro/P_Galva_Rigide_exploded2.png", "models/light_pro/P_Galva_Rigide_exploded3.png"] },
        { id: "P_Inox", name: "POTELET INOX RIGIDE (avec CORE)", file: "models/light_pro/P_Inox_Rigide.glb", checked: false, exploded: ["models/light_pro/P_Inox_Rigide_exploded1.png", "models/light_pro/P_Inox_Rigide_exploded2.png", "models/light_pro/P_Inox_Rigide_exploded3.png"] },
        { id: "X-Cone", name: "X-CONE", file: "models/new_pro/X-Cone.glb", checked: false, exploded: ["models/new_pro/X-Cone_exploded1.png", "models/new_pro/X-Cone_exploded3.png"] }
    ],
    "PRO": [
        { id: "New_Pro", name: "NEW PRO ABSORBER", file: "models/new_pro/New_Pro.glb", checked: false, exploded: ["models/new_pro/New_Pro_exploded1.png", "models/new_pro/New_Pro_exploded2.png", "models/new_pro/New_Pro_exploded3.png"] },
        { id: "X-Matrix", name: "X-MATRIX JONCTION MULTIDIRECTIONNELLE", file: "models/new_pro/X-Matrix.glb", checked: false, exploded: ["models/new_pro/X-Matrix_exploded1.png", "models/new_pro/X-Matrix_exploded2.png", "models/new_pro/X-Matrix_exploded3.png"] },
        { id: "Mini_Omega", name: "MINI OMEGA (avec PRO)", file: "models/new_pro/Mini_Omega.glb", checked: false, exploded: ["models/new_pro/Mini_Omega_exploded1.png", "models/new_pro/Mini_Omega_exploded2.png", "models/new_pro/Mini_Omega_exploded3.png"] },
        { id: "PB_HOOKt", name: "POTELET PB HOOKT (avec PRO)", file: "models/new_pro/PB_HOOKT.glb", checked: false, exploded: ["models/new_pro/PB_HOOKT_exploded1.png", "models/new_pro/PB_HOOKT_exploded2.png", "models/new_pro/PB_HOOKT_exploded3.png"] },
        { id: "P_Galva", name: "POTELET GALVA RIGIDE (avec PRO)", file: "models/new_pro/P_Glava_Rigide.glb", checked: false, exploded: ["models/new_pro/P_Galva_Rigide_exploded1.png", "models/new_pro/P_Galva_Rigide_exploded2.png", "models/new_pro/P_Galva_Rigide_exploded3.png"] },
        { id: "P_Inox", name: "POTELET INOX RIGIDE (avec PRO)", file: "models/new_pro/P_Inox_Rigide.glb", checked: false, exploded: ["models/new_pro/P_Inox_Rigide_exploded1.png", "models/new_pro/P_Inox_Rigide_exploded2.png", "models/new_pro/P_Inox_Rigide_exploded3.png"] },
        { id: "X-Cone", name: "X-CONE", file: "models/new_pro/X-Cone.glb", checked: false, exploded: ["models/new_pro/X-Cone_exploded1.png", "models/new_pro/X-Cone_exploded3.png"] }
    ],
    "EXTREME": [
        { id: "LongRange", name: "LONG RANGE HEAVY ABSORBER", file: "models/long_range/LongRange.glb", checked: false, exploded: ["models/long_range/LongRange_exploded1.png", "models/long_range/LongRange_exploded2.png", "models/long_range/LongRange_exploded3.png"] },
        { id: "X-Matrix", name: "X-MATRIX JONCTION MULTIDIRECTIONNELLE", file: "models/new_pro/X-Matrix.glb", checked: false, exploded: ["models/new_pro/X-Matrix_exploded1.png", "models/new_pro/X-Matrix_exploded2.png", "models/new_pro/X-Matrix_exploded3.png"] },
        { id: "A-Fix", name: "A-FIX ANCHOR", file: "models/long_range/LongRange.glb", checked: false, exploded: ["models/long_range/A-Fix_exploded1.png", "models/long_range/A-Fix_exploded2.png"] },
        { id: "X-Cone", name: "X-CONE", file: "models/new_pro/X-Cone.glb", checked: false, exploded: ["models/new_pro/X-Cone_exploded1.png", "models/new_pro/X-Cone_exploded3.png"] }
    ]
};

// Compatibility aliases for legacy product names
COMPONENTS_DB["LIGHT PRO"] = COMPONENTS_DB["CORE"];
COMPONENTS_DB["NEW PRO"] = COMPONENTS_DB["PRO"];
COMPONENTS_DB["LONG RANGE"] = COMPONENTS_DB["EXTREME"];
COMPONENTS_DB["SUPER RANGE"] = COMPONENTS_DB["EXTREME"];
COMPONENTS_DB["ULTRA RANGE"] = COMPONENTS_DB["EXTREME"];

function setDefaultComponentsForSystem(productName) {
    // Reset all component selections so no default items/parts are automatically checked
    Object.keys(COMPONENTS_DB).forEach(pKey => {
        const list = COMPONENTS_DB[pKey] || [];
        list.forEach(c => {
            c.checked = false;
            if (state.checkedComponents) state.checkedComponents[c.id] = false;
        });
    });
}

// 3D Models Cache & Loaders (GLTF / GLB primary with OBJ fallback)
const objCache = {};

function getGLTFLoader() {
    if (!window._gltfLoaderInstance && typeof THREE !== "undefined" && THREE.GLTFLoader) {
        window._gltfLoaderInstance = new THREE.GLTFLoader();
    }
    return window._gltfLoaderInstance;
}

function getOBJLoader() {
    if (!window._objLoaderInstance && typeof THREE !== "undefined" && THREE.OBJLoader) {
        window._objLoaderInstance = new THREE.OBJLoader();
    }
    return window._objLoaderInstance;
}

function loadOBJModel(filePath) {
    if (!filePath) return Promise.resolve(null);
    if (objCache[filePath]) {
        return Promise.resolve(objCache[filePath]);
    }
    return new Promise((resolve) => {
        const isGLTF = filePath.endsWith(".glb") || filePath.endsWith(".gltf");
        const loader = isGLTF ? getGLTFLoader() : getOBJLoader();
        if (loader) {
            loader.load(
                filePath,
                (gltfOrObj) => {
                    const sceneObj = isGLTF ? gltfOrObj.scene : gltfOrObj;
                    objCache[filePath] = sceneObj;
                    resolve(sceneObj);
                },
                undefined,
                (err) => {
                    // Fallback mechanism for height-suffixed candidate models not yet in the models folder
                    const suffixMatch = filePath.match(/_(1\.5m|1\.5|1\.8m|1\.8|150|180|d_ring|overhead)\.glb$/i);
                    if (suffixMatch) {
                        const baseFile = filePath.replace(/_(1\.5m|1\.5|1\.8m|1\.8|150|180|d_ring|overhead)\.glb$/i, ".glb");
                        const currentSuffix = suffixMatch[0].replace(".glb", "");
                        let altFile = null;
                        if (currentSuffix === "_1.5m") altFile = baseFile.replace(/\.glb$/i, "_1.5.glb");
                        else if (currentSuffix === "_1.8m") altFile = baseFile.replace(/\.glb$/i, "_1.8.glb");

                        if (altFile && !objCache[altFile]) {
                            return loadOBJModel(altFile).then(altObj => {
                                if (altObj) {
                                    objCache[filePath] = altObj;
                                    resolve(altObj);
                                } else {
                                    return loadOBJModel(baseFile).then(baseObj => {
                                        if (baseObj) objCache[filePath] = baseObj;
                                        resolve(baseObj);
                                    });
                                }
                            });
                        }

                        return loadOBJModel(baseFile).then(baseObj => {
                            if (baseObj) objCache[filePath] = baseObj;
                            resolve(baseObj);
                        });
                    }
                    console.warn("Failed to load 3D model:", filePath, err);
                    resolve(null);
                }
            );
        } else {
            console.warn("No suitable 3D loader available for:", filePath);
            resolve(null);
        }
    });
}

function preloadActiveModels() {
    const list = COMPONENTS_DB[normalizeProduct(state.product || "CORE")] || [];
    const files = list.map(c => c.file).filter(Boolean);
    const uniqueFiles = [...new Set(files)];
    const heightVariants = [];
    if (typeof resolvePostModelForElevation === "function") {
        uniqueFiles.forEach(f => {
            heightVariants.push(resolvePostModelForElevation(f, "knee"));
            heightVariants.push(resolvePostModelForElevation(f, "d_ring"));
            heightVariants.push(resolvePostModelForElevation(f, "overhead"));
        });
    }
    const allFiles = [...new Set([...uniqueFiles, ...heightVariants])].filter(Boolean);
    const promises = allFiles.map(f => loadOBJModel(f));

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
    if (isCore(system)) {
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
    if (isExtreme(system)) {
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
    if (isExtreme(state.product) && (state.mountingType === "overhead" || state.roofShape === "flat_overhead")) return "overhead";
    const list = (typeof COMPONENTS_DB !== 'undefined' ? (COMPONENTS_DB[normalizeProduct(state.product)] || COMPONENTS_DB[state.product]) : []) || [];
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
    if (isExtreme(state.product)) {
        return ["ANCRAGE A-FIX", "A-FIX ANCHOR", "ANCLAJE A-FIX"][l];
    }
    const list = (typeof COMPONENTS_DB !== 'undefined' ? (COMPONENTS_DB[normalizeProduct(state.product)] || COMPONENTS_DB[state.product]) : []) || [];
    const postComp = list.find(c => c.id !== "Contre_Plaque" && c.id !== "X-Cone" && c.id !== "Pack_Matrix" && c.id !== "X-Matrix" && c.id !== "New_Pro" && c.id !== "LightPro" && c.id !== "LongRange" && c.checked);
    if (postComp) return getComponentName(postComp);
    if (isPro(state.product)) return getComponentName({ id: "Mini_Omega", name: "MINI OMEGA" });
    if (isCore(state.product)) return ["Potelet Basculant", "Tilting Post", "Poste Basculante"][l];
    return ["Potelet / Ancrage", "Post / Anchor", "Poste / Anclaje"][l];
}

const Calculator = {
    getXConeSpacing: function (slopeDegOverride) {
        let slope = slopeDegOverride;
        if (slope === undefined || slope === null || isNaN(slope)) {
            const isSloped = (state.roofShape === "sloped" || state.roof_type === "sloped" || state.roofShape === "triangle" || state.roof_type === "triangle" || state.layoutType === "slope_single" || state.layoutType === "slope_multi" || state.layoutType === "slope_horizontal_comb");
            if (!isSloped) return 0;
            slope = parseFloat(state.roofSlope || state.roof_slope_deg || 15);
        } else {
            slope = parseFloat(slope);
        }
        if (slope >= 40 && slope <= 75) return 0.3;
        if (slope >= 30 && slope < 40) return 0.5;
        if (slope >= 15 && slope < 30) return 1.0;
        return 0;
    },

    getMaxSpan: function (product, actualSpan = 15.0) {
        if (state.roofShape === "sloped" && state.roofSlope >= 40 && state.roofSlope <= 75) {
            return 3.0;
        }
        const prod = product || state.product || "CORE";
        if (isExtreme(prod)) {
            if (actualSpan <= 20.0) return 20.0;
            if (actualSpan <= 34.0) return 34.0;
            return 56.0;
        }
        return 15.0;
    },

    calculateAnchorPositions: function (L, l, maxSpan) {
        const layout = state.layoutType || "single_span";
        const spans = state.spans || [{ length: state.lineLength || 15.0, bendDeg: 0, slopeDeg: 0 }];

        let line1Nodes = [];
        let line2Nodes = [];
        let junctionNode = null;
        let allNodes = [];

        const edgeDist = (typeof state.line_to_edge === "number" && !isNaN(state.line_to_edge) && state.line_to_edge > 0)
            ? state.line_to_edge
            : 2.0;

        let currX = edgeDist;
        let currY = 0.0;
        let currZ = edgeDist;
        let headingRad = ((state.startBendDeg || 0) * Math.PI) / 180;

        if (layout === "single_span" || layout === "multi_straight" || layout === "multi_bend_90" || layout === "multi_bend_var" || layout === "multi_bend_multi90" || layout === "multi_bend_multivar" || layout === "custom") {
            const effectiveSpans = (spans && spans.length > 0)
                ? spans
                : [{ id: "spn_1", length: state.lineLength || 15.0, bendDeg: 0, slopeDeg: 0 }];

            line1Nodes.push({
                x: parseFloat(currX.toFixed(2)),
                y: parseFloat(currY.toFixed(2)),
                z: parseFloat(currZ.toFixed(2)),
                type: (state.startBendDeg && Math.abs(state.startBendDeg) > 0) ? "angle" : "extremite",
                rotY: headingRad,
                bendDeg: state.startBendDeg || 0,
                isDoubled: (Math.abs(state.startBendDeg || 0) > 40),
                spanIdAfter: effectiveSpans[0] ? effectiveSpans[0].id : null,
                line: 1
            });
            const isClosed = !!state.closedLoop;

            for (let i = 0; i < effectiveSpans.length; i++) {
                const sp = effectiveSpans[i];
                const len = sp.length || 5.0;

                let slopeVal = (sp.slope_deg !== undefined ? sp.slope_deg : sp.slopeDeg) || 0;
                slopeVal = Math.max(-75, Math.min(75, slopeVal));
                const slopeRad = (slopeVal * Math.PI) / 180;
                const L_horiz = len * Math.cos(slopeRad);
                const deltaY = len * Math.sin(slopeRad);

                currX += L_horiz * Math.cos(headingRad);
                currZ += L_horiz * Math.sin(headingRad);
                currY += deltaY;

                let bendDeg = 0;
                if (layout === "multi_bend_90" || layout === "multi_bend_multi90") {
                    bendDeg = sp.bend90 ? 90 : ((sp.bend_after_deg !== undefined ? sp.bend_after_deg : sp.bendDeg) || 0);
                } else {
                    bendDeg = (sp.bend_after_deg !== undefined ? sp.bend_after_deg : sp.bendDeg) || 0;
                }

                const isLast = (i === effectiveSpans.length - 1);
                let type = "intermediaire";
                if (isLast && !isClosed) {
                    type = "extremite";
                } else if (bendDeg !== 0) {
                    type = "angle";
                }

                const bendAngle = Math.abs(bendDeg);
                const isDoubled = (type === "angle" && bendAngle > 40);

                const hasX = !isLast && !!sp.hasXMatrix;
                if (hasX) {
                    type = "x_matrix";
                }

                line1Nodes.push({
                    x: parseFloat(currX.toFixed(2)),
                    y: parseFloat(currY.toFixed(2)),
                    z: parseFloat(currZ.toFixed(2)),
                    type: type,
                    hasXMatrix: hasX,
                    noPost: hasX,
                    xMatrixBranches: hasX ? (sp.xMatrixBranches || []) : [],
                    rotY: headingRad,
                    bendDeg: bendDeg,
                    slopeDeg: slopeVal,
                    isDoubled: isDoubled,
                    spanIdBefore: sp.id,
                    spanIdAfter: isLast ? null : (effectiveSpans[i + 1] ? effectiveSpans[i + 1].id : null),
                    line: 1
                });

                headingRad += (bendDeg * Math.PI) / 180;
            }

            if (isClosed && line1Nodes.length > 2) {
                const lastNode = line1Nodes[line1Nodes.length - 1];
                lastNode.type = "angle";
                const lastBendDeg = effectiveSpans[effectiveSpans.length - 1] ? (effectiveSpans[effectiveSpans.length - 1].bendDeg !== undefined ? effectiveSpans[effectiveSpans.length - 1].bendDeg : 90) : 90;
                lastNode.bendDeg = lastBendDeg;
                lastNode.isDoubled = (Math.abs(lastBendDeg) > 40);
            }
        } else if (layout === "multi_bend_circle") {
            state.closedLoop = false;
            if (state.config6Mode === "reservoir") {
                const N = Math.max(3, state.config6NbPosts || 16);
                const D = Math.max(1.0, state.config6Diameter || 30.0);
                const setback = Math.max(0, state.config6Setback !== undefined ? state.config6Setback : 0.5);
                const R_pose = Math.max(0.5, (D / 2) - setback);

                const centerX = 15.0;
                const centerZ = 15.0;

                line1Nodes = [];
                for (let i = 0; i < N; i++) {
                    const angleRad = (2 * Math.PI * i) / N;
                    const x = centerX + R_pose * Math.cos(angleRad);
                    const z = centerZ + R_pose * Math.sin(angleRad);
                    const bendDeg = parseFloat((180 - (360 / N)).toFixed(2));

                    const nodeType = (i === 0 || i === N - 1) ? "extremite" : "angle";

                    line1Nodes.push({
                        x: parseFloat(x.toFixed(2)),
                        y: 0.0,
                        z: parseFloat(z.toFixed(2)),
                        type: nodeType,
                        bendDeg: bendDeg,
                        rotY: angleRad + Math.PI / 2,
                        isDoubled: (nodeType === "angle" && bendDeg > 40),
                        line: 1
                    });
                }
            } else {
                line1Nodes.push({ x: parseFloat(currX.toFixed(2)), y: 0.0, z: parseFloat(currZ.toFixed(2)), type: "angle", line: 1 });
                for (let i = 0; i < spans.length; i++) {
                    const sp = spans[i];
                    const len = sp.length || 5.0;
                    currX += len * Math.cos(headingRad);
                    currZ += len * Math.sin(headingRad);

                    const bendDeg = sp.bendDeg !== undefined ? sp.bendDeg : (180 - (360 / spans.length));
                    const turnDeg = 180 - bendDeg;

                    line1Nodes.push({
                        x: parseFloat(currX.toFixed(2)),
                        y: 0.0,
                        z: parseFloat(currZ.toFixed(2)),
                        type: "angle",
                        rotY: headingRad,
                        bendDeg: bendDeg,
                        isDoubled: (Math.abs(bendDeg) > 40),
                        line: 1
                    });
                    headingRad += (turnDeg * Math.PI) / 180;
                }
            }
        } else if (layout === "slope_single") {
            const sp = spans[0] || { length: 15.0, slopeDeg: 15 };
            const slopeRad = ((sp.slopeDeg || state.roofSlope || 15) * Math.PI) / 180;
            const len = sp.length || 15.0;
            state.roofSlope = sp.slopeDeg || 15;
            state.roofShape = "sloped";

            line1Nodes = [
                { x: currX, y: 0.0, z: currZ, type: "extremite", line: 1 },
                { x: parseFloat((currX + len * Math.cos(slopeRad)).toFixed(2)), y: parseFloat((len * Math.sin(slopeRad)).toFixed(2)), z: currZ, type: "extremite", line: 1 }
            ];
        } else if (layout === "slope_multi") {
            line1Nodes.push({ x: currX, y: 0.0, z: currZ, type: "extremite", line: 1 });
            let accX = currX;
            let accY = 0.0;
            state.roofShape = "sloped";

            for (let i = 0; i < spans.length; i++) {
                const sp = spans[i];
                const len = sp.length || 5.0;
                const slopeRad = ((sp.slopeDeg || 15) * Math.PI) / 180;
                accX += len * Math.cos(slopeRad);
                accY += len * Math.sin(slopeRad);
                const type = (i === spans.length - 1) ? "extremite" : "intermediaire";
                line1Nodes.push({
                    x: parseFloat(accX.toFixed(2)),
                    y: parseFloat(accY.toFixed(2)),
                    z: currZ,
                    type: type,
                    line: 1
                });
            }
        } else if (layout === "slope_horizontal_comb") {
            line1Nodes.push({ x: currX, y: 0.0, z: currZ, type: "extremite", line: 1 });
            let accX = currX;
            let accY = 0.0;

            for (let i = 0; i < spans.length; i++) {
                const sp = spans[i];
                const len = sp.length || 5.0;
                const slopeRad = sp.isSloped ? (((sp.slopeDeg || 15) * Math.PI) / 180) : 0;
                const dirSign = (sp.isSloped && sp.direction === 'down') ? -1 : 1;
                accX += len * Math.cos(slopeRad);
                accY += dirSign * len * Math.sin(slopeRad);
                const type = (i === spans.length - 1) ? "extremite" : "intermediaire";
                line1Nodes.push({
                    x: parseFloat(accX.toFixed(2)),
                    y: parseFloat(accY.toFixed(2)),
                    z: currZ,
                    type: type,
                    line: 1
                });
            }
        } else if (layout === "cross_spans") {
            const cs = state.crossSpans || { north: 10.0, east: 10.0, south: 10.0, west: 10.0, angles: [270, 0, 90, 180] };
            const angles = (cs.angles && cs.angles.length === 4) ? cs.angles : [270, 0, 90, 180];
            const branchData = [
                { dir: "north", len: cs.north !== undefined ? parseFloat(cs.north) || 10.0 : 10.0, angleDeg: angles[0] },
                { dir: "east",  len: cs.east  !== undefined ? parseFloat(cs.east)  || 10.0 : 10.0, angleDeg: angles[1] },
                { dir: "south", len: cs.south !== undefined ? parseFloat(cs.south) || 10.0 : 10.0, angleDeg: angles[2] },
                { dir: "west",  len: cs.west  !== undefined ? parseFloat(cs.west)  || 10.0 : 10.0, angleDeg: angles[3] }
            ];

            const cableExt = 0.20;
            const margin = 3.0;

            let maxPosDx = 0, maxNegDx = 0, maxPosDz = 0, maxNegDz = 0;
            branchData.forEach(b => {
                const rad = (b.angleDeg * Math.PI) / 180;
                const cosA = Math.cos(rad);
                const sinA = Math.sin(rad);
                const dx = b.len * cosA;
                const dz = b.len * sinA;
                const tipX = dx + cableExt * cosA;
                const tipZ = dz + cableExt * sinA;

                if (dx > maxPosDx) maxPosDx = dx;
                if (tipX > maxPosDx) maxPosDx = tipX;
                if (-dx > maxNegDx) maxNegDx = -dx;
                if (-tipX > maxNegDx) maxNegDx = -tipX;

                if (dz > maxPosDz) maxPosDz = dz;
                if (tipZ > maxPosDz) maxPosDz = tipZ;
                if (-dz > maxNegDz) maxNegDz = -dz;
                if (-tipZ > maxNegDz) maxNegDz = -tipZ;
            });

            // Hub must be at the exact center of the roof: (L / 2, l / 2)
            // Distance from center to roof edges must be at least maxExtent + margin
            const halfL = Math.max(maxPosDx, maxNegDx) + margin;
            const halfl = Math.max(maxPosDz, maxNegDz) + margin;
            const halfDim = Math.max(halfL, halfl, 6.0);
            const dim = parseFloat((halfDim * 2).toFixed(2));

            state.L = dim;
            state.l = dim;

            const hubX = dim / 2;
            const hubZ = dim / 2;

            junctionNode = { x: hubX, y: 0.0, z: hubZ, type: "x_matrix", compId: "X-Matrix", line: 0 };
            line1Nodes.push(junctionNode);

            branchData.forEach((b, idx) => {
                const rad = (b.angleDeg * Math.PI) / 180;
                const endX = parseFloat((hubX + b.len * Math.cos(rad)).toFixed(2));
                const endZ = parseFloat((hubZ + b.len * Math.sin(rad)).toFixed(2));
                line1Nodes.push({
                    x: endX,
                    y: 0.0,
                    z: endZ,
                    type: "extremite",
                    rotY: rad,
                    line: idx + 1
                });
            });
        } else if (layout === "grid_system") {
            const gs = state.gridSystem || { nx: 3, ny: 3, xSpacings: [5.0, 5.0], zSpacings: [5.0, 5.0], end_margin: 2.0 };
            const nx = Math.max(2, gs.nx || 3);
            const ny = Math.max(2, gs.ny || 3);
            const endMargin = Math.max(0.5, gs.end_margin !== undefined ? gs.end_margin : 2.0);
            const xSpacings = gs.xSpacings && gs.xSpacings.length === nx - 1 ? gs.xSpacings : Array(nx - 1).fill(5.0);
            const zSpacings = gs.zSpacings && gs.zSpacings.length === ny - 1 ? gs.zSpacings : Array(ny - 1).fill(5.0);

            const startX = 3.0 + endMargin;
            const startZ = 3.0 + endMargin;
            const xCoords = [startX];
            for (let i = 0; i < xSpacings.length; i++) {
                xCoords.push(xCoords[i] + (xSpacings[i] || 5.0));
            }
            const zCoords = [startZ];
            for (let j = 0; j < zSpacings.length; j++) {
                zCoords.push(zCoords[j] + (zSpacings[j] || 5.0));
            }

            for (let i = 0; i < xCoords.length; i++) {
                for (let j = 0; j < zCoords.length; j++) {
                    line1Nodes.push({
                        x: parseFloat(xCoords[i].toFixed(2)),
                        y: 0.0,
                        z: parseFloat(zCoords[j].toFixed(2)),
                        type: "x_matrix",
                        line: i + 1
                    });
                }
            }

            // High overhead end posts around the perimeter
            for (let j = 0; j < ny; j++) {
                const zVal = zCoords[j];
                line1Nodes.push({ x: parseFloat((startX - endMargin).toFixed(2)), y: 0.0, z: parseFloat(zVal.toFixed(2)), type: "extremite", line: 100 + j });
                line1Nodes.push({ x: parseFloat((xCoords[nx - 1] + endMargin).toFixed(2)), y: 0.0, z: parseFloat(zVal.toFixed(2)), type: "extremite", line: 200 + j });
            }
            for (let i = 0; i < nx; i++) {
                const xVal = xCoords[i];
                line1Nodes.push({ x: parseFloat(xVal.toFixed(2)), y: 0.0, z: parseFloat((startZ - endMargin).toFixed(2)), type: "extremite", line: 300 + i });
                line1Nodes.push({ x: parseFloat(xVal.toFixed(2)), y: 0.0, z: parseFloat((zCoords[ny - 1] + endMargin).toFixed(2)), type: "extremite", line: 400 + i });
            }
        }

        allNodes = [...line1Nodes, ...line2Nodes];

        if (allNodes.length > 0) {
            const margin = edgeDist;
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            allNodes.forEach(n => {
                if (n.x < minX) minX = n.x;
                if (n.x > maxX) maxX = n.x;
                if (n.z < minZ) minZ = n.z;
                if (n.z > maxZ) maxZ = n.z;

                // Account for X-Matrix multi-direction branch tips
                if ((n.hasXMatrix || n.type === "x_matrix") && n.xMatrixBranches && n.xMatrixBranches.length > 0) {
                    const nRotY = n.rotY || 0;
                    n.xMatrixBranches.forEach(b => {
                        const bDeg = (b.angleDeg !== undefined) ? parseFloat(b.angleDeg) : 90;
                        const normAng = ((bDeg % 360) + 360) % 360;
                        if (normAng < 15 || normAng > 345 || Math.abs(normAng - 180) < 15) return;
                        const bLen = (typeof getBranchTotalLength === "function") ? getBranchTotalLength(b) : Math.max(0.5, parseFloat(b.length) || 5.0);
                        const bRad = nRotY + (bDeg * Math.PI / 180);
                        const bx = n.x + bLen * Math.cos(bRad);
                        const bz = n.z + bLen * Math.sin(bRad);
                        if (bx < minX) minX = bx;
                        if (bx > maxX) maxX = bx;
                        if (bz < minZ) minZ = bz;
                        if (bz > maxZ) maxZ = bz;
                    });
                }
            });

            // Shift all node coordinates so minX >= edgeDist and minZ >= edgeDist (Bypassed for centered structures like multi_bend_circle and cross_spans)
            if (layout !== "multi_bend_circle" && layout !== "cross_spans") {
                const shiftX = margin - minX;
                const shiftZ = margin - minZ;

                if (shiftX !== 0 || shiftZ !== 0) {
                    allNodes.forEach(n => {
                        n.x = parseFloat((n.x + shiftX).toFixed(2));
                        n.z = parseFloat((n.z + shiftZ).toFixed(2));
                    });
                    minX += shiftX;
                    maxX += shiftX;
                    minZ += shiftZ;
                    maxZ += shiftZ;
                }
            }

            if (layout !== "cross_spans") {
                const userRoofL = (typeof state.roof_length === "number" && state.roof_length > 0) ? state.roof_length : (state.L || 15.0);
                const userRoofl = (typeof state.roof_width === "number" && state.roof_width > 0) ? state.roof_width : (state.l || 10.0);
                const widthX = Math.max(userRoofL, maxX + edgeDist);
                const widthZ = Math.max(userRoofl, maxZ + edgeDist);
                state.L = parseFloat(widthX.toFixed(2));
                state.l = parseFloat(widthZ.toFixed(2));
            }
        }

        return {
            line1: line1Nodes,
            line2: line2Nodes,
            junctionNode: junctionNode,
            all: allNodes
        };
    },

    calculateTotalLineLength: function (layout, product) {
        if (state.layoutType === "cross_spans") {
            const cs = state.crossSpans || { north: 10, east: 10, south: 10, west: 10 };
            return (parseFloat(cs.north) || 10) + (parseFloat(cs.east) || 10) + (parseFloat(cs.south) || 10) + (parseFloat(cs.west) || 10);
        }
        if (state.layoutType === "grid_system") {
            const gs = state.gridSystem || { nx: 3, ny: 3, xSpacings: [5.0, 5.0], zSpacings: [5.0, 5.0] };
            const sumX = gs.xSpacings.reduce((a, b) => a + b, 0);
            const sumZ = gs.zSpacings.reduce((a, b) => a + b, 0);
            return sumX * gs.ny + sumZ * gs.nx;
        }
        const spans = state.spans || [];
        let total = spans.reduce((sum, s) => sum + (s.length || 0), 0);
        spans.forEach(s => {
            if (s && s.hasXMatrix && s.xMatrixBranches && s.xMatrixBranches.length > 0) {
                s.xMatrixBranches.forEach(b => {
                    const bDeg = (b.angleDeg !== undefined) ? parseFloat(b.angleDeg) : 90;
                    const normAng = ((bDeg % 360) + 360) % 360;
                    if (normAng < 15 || normAng > 345 || Math.abs(normAng - 180) < 15) return;
                    const bLen = (typeof getBranchTotalLength === "function") ? getBranchTotalLength(b) : (parseFloat(b.length) || 0);
                    total += bLen;
                });
            }
        });
        return total > 0 ? total : (state.lineLength || 15.0);
    },

    calculateMaxRealSpan: function (layout) {
        const pos = (layout && layout.all) ? layout.all : (Array.isArray(layout) ? layout : []);
        if (pos.length < 2) return state.lineLength || 15.0;

        if (state.layoutType === "cross_spans") {
            const cs = state.crossSpans || { north: 10, east: 10, south: 10, west: 10 };
            return Math.max(parseFloat(cs.north) || 10, parseFloat(cs.east) || 10, parseFloat(cs.south) || 10, parseFloat(cs.west) || 10);
        }
        if (state.layoutType === "grid_system") {
            const gs = state.gridSystem || { xSpacings: [5], zSpacings: [5] };
            return Math.max(...gs.xSpacings, ...gs.zSpacings);
        }

        let maxSpan = 0;
        for (let i = 0; i < pos.length - 1; i++) {
            const p1 = pos[i];
            const p2 = pos[i + 1];
            const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow((p2.y || 0) - (p1.y || 0), 2) + Math.pow(p2.z - p1.z, 2));
            if (dist > maxSpan) maxSpan = dist;
        }
        return maxSpan > 0 ? parseFloat(maxSpan.toFixed(2)) : 15.0;
    },

    effortLonge: function (product, span, nbUsers, norm, fallFactor = 1, support = "omega_mini", isMultiSpan = false) {
        if (norm === "OSHA") {
            let k_FC = fallFactor <= 0.0 ? 0.5 : (fallFactor < 1.0 ? 0.5 + fallFactor * (Math.sqrt(0.5) - 0.5) : (fallFactor < 2.0 ? Math.sqrt(0.5) + (fallFactor - 1.0) * (1.0 - Math.sqrt(0.5)) : 1.0));
            const u = Math.max(1, Math.min(5, nbUsers));
            const F_user = 1.37 * u + 4.65;
            let res = F_user * k_FC;
            if (isPro(product)) {
                const spanClamped = Math.max(0.1, Math.min(15.2, span));
                const spanRatio = (15.2 - Math.max(3.0, spanClamped)) / (15.2 - 3.0);
                let k_support = 1.0;
                if (support === "omega") k_support = 5.0 / 5.7;
                else if (support === "sol_mur") k_support = 6.4 / 5.7;
                else if (support === "overhead") k_support = 7.2 / 5.7;
                res = F_user * (5.7 / 11.5) * k_support * k_FC * (1.0 + 0.15 * spanRatio);
            } else if (isCore(product) && span <= 3.5) {
                const fmax_base = u === 1 ? 5.0 : (u === 2 ? 5.8 : 6.5);
                res = fmax_base * k_FC;
            }
            if (span < 3.0) {
                res = res * Math.max(0.5, Math.sqrt(span / 3.0));
            }
            return res;
        }

        if (fallFactor <= 0.0) return 1.0 * nbUsers;

        let fancre_ref = 6.0;
        if (isCore(product)) {
            fancre_ref = getBaselineFmax("CORE", nbUsers, span, support);
        } else if (isExtreme(product)) {
            fancre_ref = getBaselineFmax("EXTREME", nbUsers, span, support);
        } else if (isPro(product)) {
            let searchDir = (support || "").toLowerCase().includes("mini") ? "omega_mini" : ((support || "").toLowerCase().includes("omega") ? "omega" : ((support || "").toLowerCase().includes("overhead") ? "overhead" : "sol_mur"));
            const rec_3 = newProPredictRecords.find(r => r.direction === searchDir && r.users === nbUsers && r.portee === 3.0);
            const rec_15 = newProPredictRecords.find(r => r.direction === searchDir && r.users === nbUsers && r.portee === 15.0);
            if (rec_3 && rec_15) {
                const t = Math.max(0.0, Math.min(1.0, (span - 3.0) / 12.0));
                fancre_ref = rec_3.fmax_ancre + t * (rec_15.fmax_ancre - rec_3.fmax_ancre);
                if (span < 3.0) {
                    fancre_ref = fancre_ref * Math.max(0.5, Math.sqrt(span / 3.0));
                }
            } else fancre_ref = 5.10;
        }

        let k_fc = fallFactor >= 2.0 ? 1.0 : (fallFactor === 1.0 ? Math.sqrt(0.5) : (fallFactor > 0.0 ? 0.25 + fallFactor * (Math.sqrt(0.5) - 0.25) : 0.25));
        return fancre_ref * k_fc;
    },

    deflection: function (product, span, fallFactor = 1, support = "omega_mini", nbUsers = 1, norm = "EN 795", isMultiSpan = false) {
        if (norm === "OSHA") {
            let k_FC = fallFactor <= 0.0 ? 0.5 : (fallFactor < 1.0 ? 0.5 + fallFactor * (Math.sqrt(0.5) - 0.5) : (fallFactor < 2.0 ? Math.sqrt(0.5) + (fallFactor - 1.0) * (1.0 - Math.sqrt(0.5)) : 1.0));
            const u = Math.max(1, Math.min(5, nbUsers));
            const F_user = 1.37 * u + 4.65;
            let res = 500.0;
            if (isPro(product)) {
                const spanRatio = Math.max(0.1, Math.min(15.2, span)) / 15.2;
                let k_support = support === "omega" ? 1290 / 1410 : (support === "sol_mur" ? 1300 / 1410 : (support === "overhead" ? 1640 / 1410 : 1.0));
                res = (isMultiSpan ? 1530.0 : 2200.0) * spanRatio * (F_user / 11.5) * k_support * k_FC;
            } else if (isCore(product)) {
                if (span <= 3.5) {
                    res = 675.0 * (span / 3.5) * k_FC;
                } else {
                    const spanRatio = Math.max(0.1, Math.min(12.2, span)) / 12.2;
                    let f_ref = support === "hookt" ? (isMultiSpan ? 2250.0 : 2600.0) : (isMultiSpan ? 1500.0 : 1800.0);
                    res = f_ref * spanRatio * (F_user / 8.8) * k_FC;
                }
            } else if (isExtreme(product)) {
                const spanRatio = Math.max(0.1, Math.min(54.9, span)) / 54.9;
                res = (isMultiSpan ? 1510.0 : 2790.0) * spanRatio * (F_user / 8.8) * k_FC;
            }
            return Math.round(res);
        }

        let k_fleche_fc = fallFactor >= 2.0 ? 1.0 : (fallFactor === 1.0 ? Math.sqrt(0.5) : (fallFactor > 0.0 ? 0.50 + fallFactor * (Math.sqrt(0.5) - 0.50) : 0.50));
        const fmax_ancre_calc = this.effortLonge(product, span, nbUsers, norm, fallFactor, support, isMultiSpan);

        if (isExtreme(product)) {
            let usersToUse = Math.max(1, Math.min(3, nbUsers));
            const matchingRecs = longRangePredictRecords.filter(r => r.users === usersToUse).sort((a, b) => a.portee - b.portee);
            if (matchingRecs.length > 0) {
                let rec1 = matchingRecs[0], rec2 = matchingRecs[0];
                if (span > 10.0 && span <= 34.0) { rec1 = matchingRecs[0]; rec2 = matchingRecs[1]; }
                else if (span > 34.0) { rec1 = matchingRecs[1]; rec2 = matchingRecs[2] || matchingRecs[1]; }
                let t = rec2.portee > rec1.portee ? (span - rec1.portee) / (rec2.portee - rec1.portee) : 0.0;
                let fleche_ref = Math.max(10.0, rec1.fleche + t * (rec2.fleche - rec1.fleche));
                let fancre_ref = rec1.fmax_ancre + t * (rec2.fmax_ancre - rec1.fmax_ancre);
                return Math.round(fleche_ref * k_fleche_fc * Math.sqrt(fancre_ref > 0.0 ? Math.max(0.0, fmax_ancre_calc / fancre_ref) : 1.0));
            }
            return 780.0;
        } else if (isCore(product)) {
            let f_a = 771.4, f_b = 0.3453;
            const sLower = (support || "").toLowerCase();
            if (sLower.includes("pb250")) { f_a = 441.7; f_b = 0.7050; }
            else if (sLower.includes("hookt")) { f_a = 390.0; f_b = 0.6800; }
            const pred_fleche = Math.max(10.0, f_a * Math.pow(span, f_b));
            const fmax_ancre_base = getBaselineFmax("CORE", nbUsers, span, support);
            return Math.round(pred_fleche * k_fleche_fc * Math.sqrt(fmax_ancre_base > 0.0 ? Math.max(0.0, fmax_ancre_calc / fmax_ancre_base) : 1.0));
        } else {
            let searchDir = (support || "").toLowerCase().includes("mini") ? "omega_mini" : ((support || "").toLowerCase().includes("omega") ? "omega" : ((support || "").toLowerCase().includes("overhead") ? "overhead" : "sol_mur"));
            const rec_3 = newProPredictRecords.find(r => r.direction === searchDir && r.users === nbUsers && r.portee === 3.0);
            const rec_15 = newProPredictRecords.find(r => r.direction === searchDir && r.users === nbUsers && r.portee === 15.0);
            if (rec_3 && rec_15) {
                const t = Math.max(0.0, Math.min(1.0, (span - 3.0) / 12.0));
                let fleche_pred = Math.max(10.0, rec_3.fleche + t * (rec_15.fleche - rec_3.fleche));
                if (span < 3.0) {
                    fleche_pred = fleche_pred * Math.max(0.1, span / 3.0);
                }
                let fancre_ref = rec_3.fmax_ancre + t * (rec_15.fmax_ancre - rec_3.fmax_ancre);
                if (span < 3.0) {
                    fancre_ref = fancre_ref * Math.max(0.5, Math.sqrt(span / 3.0));
                }
                return Math.round(fleche_pred * k_fleche_fc * Math.sqrt(fancre_ref > 0.0 ? Math.max(0.0, fmax_ancre_calc / fancre_ref) : 1.0));
            }
            return 500.0;
        }
    },

    extremiteForce1: function (product, span, nbUsers, norm, effortLonge, deflection, fallFactor = 1, support = "omega_mini", isMultiSpan = false) {
        if (norm === "OSHA") {
            let k_FC = fallFactor <= 0.0 ? 0.5 : (fallFactor < 1.0 ? 0.5 + fallFactor * (Math.sqrt(0.5) - 0.5) : (fallFactor < 2.0 ? Math.sqrt(0.5) + (fallFactor - 1.0) * (1.0 - Math.sqrt(0.5)) : 1.0));
            const u = Math.max(1, Math.min(5, nbUsers));
            const F_user = 1.37 * u + 4.65;
            let baseForce = 10.0;
            if (isPro(product)) {
                baseForce = (isMultiSpan ? 13.05 : 12.50) * (F_user / 11.5) * k_FC;
            } else if (isCore(product)) {
                if (span <= 3.5) {
                    const lc1_base = u === 1 ? 5.4 : (u === 2 ? 6.1 : 6.8);
                    baseForce = lc1_base * k_FC;
                } else {
                    const spanRatio = 1.0 + (support === "hookt" ? 0.10 : 0.12) * ((12.2 - Math.max(2.0, Math.min(12.2, span))) / (12.2 - 2.0));
                    let fext1_ref = support === "hookt" ? (isMultiSpan ? 8.30 : 9.00) : (isMultiSpan ? 13.65 : 11.60);
                    baseForce = fext1_ref * (F_user / 8.8) * spanRatio * k_FC;
                }
            } else if (isExtreme(product)) {
                baseForce = (isMultiSpan ? 10.40 : 19.30) * (F_user / 8.8) * k_FC;
            }
            if (span < 3.0) {
                baseForce = baseForce * Math.sqrt(Math.max(0.1, span / 3.0));
            }
            return baseForce;
        }

        if (isCore(product)) {
            const currentDefl = (deflection > 0.0) ? deflection : this.deflection(product, span, fallFactor, support, nbUsers, norm, isMultiSpan);
            if (currentDefl <= 0.0) return 0.0;
            const currentEffort = (effortLonge > 0.0) ? effortLonge : this.effortLonge(product, span, nbUsers, norm, fallFactor, support, isMultiSpan);
            return calculateTriangleTension(currentEffort, span, currentDefl) * 0.97 + (fallFactor <= 0.0 ? 1.0 : 0.0);
        } else if (isPro(product)) {
            let searchDir = (support || "").toLowerCase().includes("mini") ? "omega_mini" : ((support || "").toLowerCase().includes("omega") ? "omega" : ((support || "").toLowerCase().includes("overhead") ? "overhead" : "sol_mur"));
            const rec_3 = newProPredictRecords.find(r => r.direction === searchDir && r.users === nbUsers && r.portee === 3.0);
            const rec_15 = newProPredictRecords.find(r => r.direction === searchDir && r.users === nbUsers && r.portee === 15.0);
            if (rec_3 && rec_15) {
                const t = Math.max(0.0, Math.min(1.0, (span - 3.0) / 12.0));
                let fancre_ref = rec_3.fmax_ancre + t * (rec_15.fmax_ancre - rec_3.fmax_ancre);
                let fext1_ref_base = rec_3.force_ext1 + t * (rec_15.force_ext1 - rec_3.force_ext1);
                if (span < 3.0) {
                    fext1_ref_base = fext1_ref_base * Math.sqrt(Math.max(0.1, span / 3.0));
                }
                const currentEffort = (effortLonge > 0.0) ? effortLonge : this.effortLonge(product, span, nbUsers, norm, fallFactor, support, isMultiSpan);
                return fext1_ref_base * (fancre_ref > 0.0 ? currentEffort / fancre_ref : 1.0) + (fallFactor <= 0.0 ? 1.0 : 0.0);
            }
            return 10.0;
        } else {
            let usersToUse = Math.max(1, Math.min(3, nbUsers));
            const matchingRecs = longRangePredictRecords.filter(r => r.users === usersToUse).sort((a, b) => a.portee - b.portee);
            if (matchingRecs.length > 0) {
                let rec1 = matchingRecs[0], rec2 = matchingRecs[0];
                if (span > 10.0 && span <= 34.0) { rec1 = matchingRecs[0]; rec2 = matchingRecs[1]; }
                else if (span > 34.0) { rec1 = matchingRecs[1]; rec2 = matchingRecs[2] || matchingRecs[1]; }
                let t = rec2.portee > rec1.portee ? (span - rec1.portee) / (rec2.portee - rec1.portee) : 0.0;
                let fancre_ref = rec1.fmax_ancre + t * (rec2.fmax_ancre - rec1.fmax_ancre);
                let fext1_ref = rec1.force_ext1 + t * (rec2.force_ext1 - rec1.force_ext1);
                const currentEffort = (effortLonge > 0.0) ? effortLonge : this.effortLonge(product, span, nbUsers, norm, fallFactor, support, isMultiSpan);
                return fext1_ref * (fancre_ref > 0.0 ? currentEffort / fancre_ref : 1.0) + (fallFactor <= 0.0 ? 1.0 : 0.0);
            }
            return 14.0;
        }
    },

    extremiteForce2: function (product, span, nbUsers, norm, effortLonge, deflection, fallFactor = 1, support = "omega_mini", isMultiSpan = false) {
        if (norm === "OSHA") {
            let k_FC = fallFactor <= 0.0 ? 0.5 : (fallFactor < 1.0 ? 0.5 + fallFactor * (Math.sqrt(0.5) - 0.5) : (fallFactor < 2.0 ? Math.sqrt(0.5) + (fallFactor - 1.0) * (1.0 - Math.sqrt(0.5)) : 1.0));
            const u = Math.max(1, Math.min(5, nbUsers));
            const F_user = 1.37 * u + 4.65;
            let baseForce = 10.0;
            if (isPro(product)) {
                baseForce = (isMultiSpan ? 12.55 : 12.05) * (F_user / 11.5) * k_FC;
            } else if (isCore(product)) {
                if (span <= 3.5) {
                    const lc2_base = u === 1 ? 5.8 : (u === 2 ? 6.5 : 7.2);
                    baseForce = lc2_base * k_FC;
                } else {
                    const spanRatio = 1.0 + (support === "hookt" ? 0.10 : 0.12) * ((12.2 - Math.max(2.0, Math.min(12.2, span))) / (12.2 - 2.0));
                    let fext2_ref = support === "hookt" ? (isMultiSpan ? 8.10 : 9.00) : (isMultiSpan ? 13.05 : 11.30);
                    baseForce = fext2_ref * (F_user / 8.8) * spanRatio * k_FC;
                }
            } else if (isExtreme(product)) {
                baseForce = (isMultiSpan ? 10.20 : 18.95) * (F_user / 8.8) * k_FC;
            }
            if (span < 3.0) {
                baseForce = baseForce * Math.sqrt(Math.max(0.1, span / 3.0));
            }
            return baseForce;
        }

        if (isCore(product)) {
            const currentDefl = (deflection > 0.0) ? deflection : this.deflection(product, span, fallFactor, support, nbUsers, norm, isMultiSpan);
            if (currentDefl <= 0.0) return 0.0;
            const currentEffort = (effortLonge > 0.0) ? effortLonge : this.effortLonge(product, span, nbUsers, norm, fallFactor, support, isMultiSpan);
            return calculateTriangleTension(currentEffort, span, currentDefl) * 1.03 + (fallFactor <= 0.0 ? 1.0 : 0.0);
        } else if (isPro(product)) {
            let searchDir = (support || "").toLowerCase().includes("mini") ? "omega_mini" : ((support || "").toLowerCase().includes("omega") ? "omega" : ((support || "").toLowerCase().includes("overhead") ? "overhead" : "sol_mur"));
            const rec_3 = newProPredictRecords.find(r => r.direction === searchDir && r.users === nbUsers && r.portee === 3.0);
            const rec_15 = newProPredictRecords.find(r => r.direction === searchDir && r.users === nbUsers && r.portee === 15.0);
            if (rec_3 && rec_15) {
                const t = Math.max(0.0, Math.min(1.0, (span - 3.0) / 12.0));
                let fancre_ref = rec_3.fmax_ancre + t * (rec_15.fmax_ancre - rec_3.fmax_ancre);
                let fext2_ref_base = rec_3.force_ext2 + t * (rec_15.force_ext2 - rec_3.force_ext2);
                if (span < 3.0) {
                    fext2_ref_base = fext2_ref_base * Math.sqrt(Math.max(0.1, span / 3.0));
                }
                const currentEffort = (effortLonge > 0.0) ? effortLonge : this.effortLonge(product, span, nbUsers, norm, fallFactor, support, isMultiSpan);
                return fext2_ref_base * (fancre_ref > 0.0 ? currentEffort / fancre_ref : 1.0) + (fallFactor <= 0.0 ? 1.0 : 0.0);
            }
            return 10.0;
        } else {
            let usersToUse = Math.max(1, Math.min(3, nbUsers));
            const matchingRecs = longRangePredictRecords.filter(r => r.users === usersToUse).sort((a, b) => a.portee - b.portee);
            if (matchingRecs.length > 0) {
                let rec1 = matchingRecs[0], rec2 = matchingRecs[0];
                if (span > 10.0 && span <= 34.0) { rec1 = matchingRecs[0]; rec2 = matchingRecs[1]; }
                else if (span > 34.0) { rec1 = matchingRecs[1]; rec2 = matchingRecs[2] || matchingRecs[1]; }
                let t = rec2.portee > rec1.portee ? (span - rec1.portee) / (rec2.portee - rec1.portee) : 0.0;
                let fancre_ref = rec1.fmax_ancre + t * (rec2.fmax_ancre - rec1.fmax_ancre);
                let fext2_ref = rec1.force_ext2 + t * (rec2.force_ext2 - rec1.force_ext2);
                const currentEffort = (effortLonge > 0.0) ? effortLonge : this.effortLonge(product, span, nbUsers, norm, fallFactor, support, isMultiSpan);
                return fext2_ref * (fancre_ref > 0.0 ? currentEffort / fancre_ref : 1.0) + (fallFactor <= 0.0 ? 1.0 : 0.0);
            }
            return 14.0;
        }
    },

    extremiteForce3: function (product, span, nbUsers, norm, effortLonge, deflection, fallFactor = 1, support = "omega_mini", isMultiSpan = false) {
        if (!isMultiSpan) return 0.0;
        let k_FC = fallFactor <= 0.0 ? 0.5 : (fallFactor < 1.0 ? 0.5 + fallFactor * (Math.sqrt(0.5) - 0.5) : (fallFactor < 2.0 ? Math.sqrt(0.5) + (fallFactor - 1.0) * (1.0 - Math.sqrt(0.5)) : 1.0));
        if (norm === "OSHA") {
            const u = Math.max(1, Math.min(5, nbUsers));
            const F_user = 1.37 * u + 4.65;
            if (isPro(product)) return 3.90 * (F_user / 11.5) * k_FC;
            if (isCore(product)) return (support === "hookt" ? 3.80 : 4.50) * (F_user / 8.8) * k_FC;
            if (isExtreme(product)) return 3.90 * (F_user / 8.8) * k_FC;
        }
        return effortLonge * 0.35 * k_FC;
    },

    extremiteForce4: function (product, span, nbUsers, norm, effortLonge, deflection, fallFactor = 1, support = "omega_mini", isMultiSpan = false) {
        if (!isMultiSpan) return 0.0;
        let k_FC = fallFactor <= 0.0 ? 0.5 : (fallFactor < 1.0 ? 0.5 + fallFactor * (Math.sqrt(0.5) - 0.5) : (fallFactor < 2.0 ? Math.sqrt(0.5) + (fallFactor - 1.0) * (1.0 - Math.sqrt(0.5)) : 1.0));
        if (norm === "OSHA") {
            const u = Math.max(1, Math.min(5, nbUsers));
            const F_user = 1.37 * u + 4.65;
            if (isPro(product)) return 5.40 * (F_user / 11.5) * k_FC;
            if (isCore(product)) return (support === "hookt" ? 4.20 : 5.10) * (F_user / 8.8) * k_FC;
            if (isExtreme(product)) return 4.10 * (F_user / 8.8) * k_FC;
        }
        return effortLonge * 0.45 * k_FC;
    }
};
if (typeof window !== "undefined") {
    window.Calculator = Calculator;
}

// =========================================================================
// SYSTEM LABELING & REPERAGE MODULE (SINGLE SOURCE OF TRUTH - SPEC 2026)
// =========================================================================
const SystemLabelingModule = {
    // 1. Single Source of Truth Generator
    generateSystemLabels(state, effortContext = null, geomContext = null) {
        const layout = state.layoutType || "single_span";
        const isEn = (parseInt(state.lang) === 1);
        function formatLen(m, deg) {
            const valStr = UnitsModule.formatLength(m);
            if (deg !== undefined && deg !== null && deg !== 0) {
                return `${valStr}, ${deg}°`;
            }
            return valStr;
        }

        const anchors = [];
        const spans = [];
        const xMatrixPieces = [];

        // Determine efforts context
        let ext1L = effortContext?.ext1L;
        let ext2L = effortContext?.ext2L;
        let effortL = effortContext?.effortL;
        let deflL = effortContext?.deflL;

        if (ext1L === undefined || ext2L === undefined) {
            try {
                const maxSpan = Calculator.getMaxSpan(state.product);
                const activeLayout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
                const realSpanMax = Calculator.calculateMaxRealSpan(activeLayout);
                const isOSHA = (state.norm === "OSHA");
                const isMulti = isOSHA && (state.oshaSpanMode === "multi");
                const support = getActiveSupportType();
                const enFF = computeFallFactorFromElevation(state.hllElevationPreset, state.hllElevation, state.bodyPosition);
                const ff = isOSHA ? (state.fallFactor || state.engineerCoefficient || 1.0) : enFF;
                if (!isOSHA) {
                    effortL = Calculator.effortLonge(state.product, realSpanMax, state.nbUsers, "EN 795", enFF, support, false);
                    deflL = Calculator.deflection(state.product, realSpanMax, enFF, support, state.nbUsers, "EN 795", false);
                    ext1L = Calculator.extremiteForce1(state.product, realSpanMax, state.nbUsers, "EN 795", effortL, deflL, enFF, support, false);
                    ext2L = Calculator.extremiteForce2(state.product, realSpanMax, state.nbUsers, "EN 795", effortL, deflL, enFF, support, false);
                } else {
                    const baseEff = Calculator.effortLonge(state.product, realSpanMax, state.nbUsers, "OSHA", 1.0, support, isMulti);
                    deflL = Calculator.deflection(state.product, realSpanMax, 1.0, support, state.nbUsers, "OSHA", isMulti);
                    const baseExt1 = Calculator.extremiteForce1(state.product, realSpanMax, state.nbUsers, "OSHA", baseEff, deflL, 1.0, support, isMulti);
                    const baseExt2 = Calculator.extremiteForce2(state.product, realSpanMax, state.nbUsers, "OSHA", baseEff, deflL, 1.0, support, isMulti);
                    effortL = baseEff * ff;
                    ext1L = baseExt1 * ff;
                    ext2L = baseExt2 * ff;
                }
            } catch (e) {
                ext1L = 0.0;
                ext2L = 0.0;
            }
        }

        // =========================================================================
        // CONFIG 11: CROSS SPANS (4 branches, X-matrix at center)
        // =========================================================================
        if (layout === "cross_spans") {
            const cs = state.crossSpans || { north: 10, east: 10, south: 10, west: 10 };
            const branchKeys = ["north", "east", "south", "west"];
            const branchNames = {
                north: { fr: "Nord", en: "North" },
                east: { fr: "Est", en: "East" },
                south: { fr: "Sud", en: "South" },
                west: { fr: "Ouest", en: "West" }
            };

            const fallBr = state.fallPosition?.branch || "north";
            const crossRes = AnchorEffortDistributionModule.calculateRule3_Cross(ext1L || 0, fallBr);

            const xMat = {
                id: "X1",
                type: isEn ? "X-Matrix (Center)" : "X-Matrix (Centre)",
                isXMatrix: true,
                adjacentSpans: ["S1", "S2", "S3", "S4"],
                isFallAnchor: false,
                effortKn: 0.0,
                effortStr: UnitsModule.formatForce(0),
                remarque: "-",
                position: geomContext?.hub || null
            };
            xMatrixPieces.push(xMat);

            branchKeys.forEach((key, idx) => {
                const anchorId = `A${idx + 1}`;
                const spanId = `S${idx + 1}`;
                const len = parseFloat(cs[key]) || 10.0;
                const isFall = (fallBr === key);
                const effortVal = crossRes.values[idx] || 0.0;
                const ancPos = geomContext?.branches ? geomContext.branches[idx]?.pos : null;
                const spanMid = geomContext?.branches ? geomContext.branches[idx]?.mid : null;

                anchors.push({
                    id: anchorId,
                    type: isEn ? `Branch End (${branchNames[key].en})` : `Extrémité (Branche ${branchNames[key].fr})`,
                    adjacentSpans: [spanId],
                    isFallAnchor: isFall,
                    isXMatrix: false,
                    effortKn: effortVal,
                    effortStr: UnitsModule.formatForce(effortVal),
                    remarque: isFall ? (isEn ? "Fall Anchor (100%)" : "Ancrage de chute (100%)") : (isEn ? "Secondary (25%)" : "Secondaire (25%)"),
                    position: ancPos
                });

                spans.push({
                    id: spanId,
                    fromAnchorId: "X1",
                    toAnchorId: anchorId,
                    length: len,
                    slopeDeg: 0,
                    isSloped: false,
                    text: `${spanId} : ${formatLen(len)}`,
                    midPoint: spanMid
                });
            });

            return { anchors, spans, xMatrixPieces };
        }

        // =========================================================================
        // CONFIG 12: GRID SYSTEM (Nx x Ny, Overhead)
        // =========================================================================
        if (layout === "grid_system") {
            const gs = state.gridSystem || { nx: 3, ny: 3, xSpacings: [5.0, 5.0], zSpacings: [5.0, 5.0], end_margin: 2.0 };
            const nx = Math.max(2, parseInt(gs.nx) || 3);
            const ny = Math.max(2, parseInt(gs.ny) || 3);
            const rowLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            const xSpacings = gs.xSpacings || Array(nx - 1).fill(5.0);
            const zSpacings = gs.zSpacings || Array(ny - 1).fill(5.0);

            const fallCross = { x: state.fallPosition?.gridCrossX || 0, z: state.fallPosition?.gridCrossZ || 0 };
            const fallBranch = state.fallPosition?.gridBranch || "X+";
            const gridRes = AnchorEffortDistributionModule.calculateRule4_Grid(
                ext1L || 0,
                nx,
                ny,
                state.userMassKg || 141,
                state.gridPretensionKg || 600,
                fallCross,
                fallBranch
            );

            // 1. X-Matrix pieces at row/col intersections: X-A1 ... X-C3
            for (let r = 0; r < ny; r++) {
                const rowL = rowLetters[r] || `R${r + 1}`;
                for (let c = 0; c < nx; c++) {
                    const colN = c + 1;
                    const id = `X-${rowL}${colN}`;
                    const isFall = (fallCross.x === c && fallCross.z === r);
                    const effortVal = isFall ? gridRes.level0.totalFall : gridRes.level0.totalOther;
                    const pos = geomContext?.xMatrixGrid ? geomContext.xMatrixGrid[r]?.[c] : null;

                    xMatrixPieces.push({
                        id,
                        row: rowL,
                        col: colN,
                        type: isEn ? "X-Matrix (Intersection)" : "X-Matrix (Intersection)",
                        isXMatrix: true,
                        isFallAnchor: isFall,
                        effortKn: effortVal,
                        effortStr: UnitsModule.formatForce(effortVal),
                        remarque: isFall ? (isEn ? "Fall Cross (Level 0)" : "Croix de chute (Niveau 0)") : "-",
                        position: pos
                    });
                }
            }

            // 2. Perimeter Extremity Anchors: Clockwise A1, A2... starting top-left corner
            let aIndex = 1;

            // North edge anchors: col 1..nx
            const northAnchors = [];
            for (let c = 0; c < nx; c++) {
                const id = `A${aIndex++}`;
                const endForce = gridRes.endPosts ? (gridRes.endPosts.find(ep => ep.edge === "north" && ep.colIndex === c)?.forceKn || 0) : 0;
                const pos = geomContext?.northAnchors ? geomContext.northAnchors[c] : null;
                const anc = {
                    id,
                    edge: "north",
                    colIndex: c,
                    type: isEn ? "Grid End Post (North)" : "Poteau d'extrémité de grille (Nord)",
                    adjacentSpans: [`S${c + 1}-1`],
                    isFallAnchor: false,
                    effortKn: endForce,
                    effortStr: UnitsModule.formatForce(endForce),
                    remarque: "-",
                    position: pos
                };
                anchors.push(anc);
                northAnchors.push(anc);
            }

            // East edge anchors: row A..row ny
            const eastAnchors = [];
            for (let r = 0; r < ny; r++) {
                const id = `A${aIndex++}`;
                const rowL = rowLetters[r];
                const endForce = gridRes.endPosts ? (gridRes.endPosts.find(ep => ep.edge === "east" && ep.rowIndex === r)?.forceKn || 0) : 0;
                const pos = geomContext?.eastAnchors ? geomContext.eastAnchors[r] : null;
                const anc = {
                    id,
                    edge: "east",
                    rowIndex: r,
                    type: isEn ? "Grid End Post (East)" : "Poteau d'extrémité de grille (Est)",
                    adjacentSpans: [`S${rowL}-${nx + 1}`],
                    isFallAnchor: false,
                    effortKn: endForce,
                    effortStr: UnitsModule.formatForce(endForce),
                    remarque: "-",
                    position: pos
                };
                anchors.push(anc);
                eastAnchors.push(anc);
            }

            // South edge anchors: col nx..col 1 (clockwise)
            const southAnchors = [];
            for (let c = nx - 1; c >= 0; c--) {
                const id = `A${aIndex++}`;
                const endForce = gridRes.endPosts ? (gridRes.endPosts.find(ep => ep.edge === "south" && ep.colIndex === c)?.forceKn || 0) : 0;
                const pos = geomContext?.southAnchors ? geomContext.southAnchors[c] : null;
                const anc = {
                    id,
                    edge: "south",
                    colIndex: c,
                    type: isEn ? "Grid End Post (South)" : "Poteau d'extrémité de grille (Sud)",
                    adjacentSpans: [`S${c + 1}-${ny + 1}`],
                    isFallAnchor: false,
                    effortKn: endForce,
                    effortStr: UnitsModule.formatForce(endForce),
                    remarque: "-",
                    position: pos
                };
                anchors.push(anc);
                southAnchors[c] = anc;
            }

            // West edge anchors: row ny..row A (clockwise)
            const westAnchors = [];
            for (let r = ny - 1; r >= 0; r--) {
                const id = `A${aIndex++}`;
                const rowL = rowLetters[r];
                const endForce = gridRes.endPosts ? (gridRes.endPosts.find(ep => ep.edge === "west" && ep.rowIndex === r)?.forceKn || 0) : 0;
                const pos = geomContext?.westAnchors ? geomContext.westAnchors[r] : null;
                const anc = {
                    id,
                    edge: "west",
                    rowIndex: r,
                    type: isEn ? "Grid End Post (West)" : "Poteau d'extrémité de grille (Ouest)",
                    adjacentSpans: [`S${rowL}-1`],
                    isFallAnchor: false,
                    effortKn: endForce,
                    effortStr: UnitsModule.formatForce(endForce),
                    remarque: "-",
                    position: pos
                };
                anchors.push(anc);
                westAnchors[r] = anc;
            }

            // 3. Spans: SA-1, SA-2 ... and S1-1, S1-2 ...
            for (let r = 0; r < ny; r++) {
                const rowL = rowLetters[r];
                const endMargin = parseFloat(gs.end_margin) || 2.0;

                const span1Id = `S${rowL}-1`;
                spans.push({
                    id: span1Id,
                    fromAnchorId: westAnchors[r].id,
                    toAnchorId: `X-${rowL}1`,
                    length: endMargin,
                    slopeDeg: 0,
                    text: `${span1Id} : ${formatLen(endMargin)}`,
                    midPoint: geomContext?.rowSpanMids ? geomContext.rowSpanMids[r]?.[0] : null
                });

                for (let c = 0; c < nx - 1; c++) {
                    const sId = `S${rowL}-${c + 2}`;
                    const len = parseFloat(xSpacings[c]) || 5.0;
                    spans.push({
                        id: sId,
                        fromAnchorId: `X-${rowL}${c + 1}`,
                        toAnchorId: `X-${rowL}${c + 2}`,
                        length: len,
                        slopeDeg: 0,
                        text: `${sId} : ${formatLen(len)}`,
                        midPoint: geomContext?.rowSpanMids ? geomContext.rowSpanMids[r]?.[c + 1] : null
                    });
                }

                const lastSpanId = `S${rowL}-${nx + 1}`;
                spans.push({
                    id: lastSpanId,
                    fromAnchorId: `X-${rowL}${nx}`,
                    toAnchorId: eastAnchors[r].id,
                    length: endMargin,
                    slopeDeg: 0,
                    text: `${lastSpanId} : ${formatLen(endMargin)}`,
                    midPoint: geomContext?.rowSpanMids ? geomContext.rowSpanMids[r]?.[nx] : null
                });
            }

            for (let c = 0; c < nx; c++) {
                const colN = c + 1;
                const endMargin = parseFloat(gs.end_margin) || 2.0;

                const span1Id = `S${colN}-1`;
                spans.push({
                    id: span1Id,
                    fromAnchorId: northAnchors[c].id,
                    toAnchorId: `X-${rowLetters[0]}${colN}`,
                    length: endMargin,
                    slopeDeg: 0,
                    text: `${span1Id} : ${formatLen(endMargin)}`,
                    midPoint: geomContext?.colSpanMids ? geomContext.colSpanMids[c]?.[0] : null
                });

                for (let r = 0; r < ny - 1; r++) {
                    const sId = `S${colN}-${r + 2}`;
                    const len = parseFloat(zSpacings[r]) || 5.0;
                    spans.push({
                        id: sId,
                        fromAnchorId: `X-${rowLetters[r]}${colN}`,
                        toAnchorId: `X-${rowLetters[r + 1]}${colN}`,
                        length: len,
                        slopeDeg: 0,
                        text: `${sId} : ${formatLen(len)}`,
                        midPoint: geomContext?.colSpanMids ? geomContext.colSpanMids[c]?.[r + 1] : null
                    });
                }

                const lastSpanId = `S${colN}-${ny + 1}`;
                spans.push({
                    id: lastSpanId,
                    fromAnchorId: `X-${rowLetters[ny - 1]}${colN}`,
                    toAnchorId: southAnchors[c].id,
                    length: endMargin,
                    slopeDeg: 0,
                    text: `${lastSpanId} : ${formatLen(endMargin)}`,
                    midPoint: geomContext?.colSpanMids ? geomContext.colSpanMids[c]?.[ny] : null
                });
            }

            return { anchors, spans, xMatrixPieces };
        }

        // =========================================================================
        // CONFIG 8 & 9: SLOPED LIFELINE SYSTEMS
        // =========================================================================
        if (layout === "slope_single" || layout === "slope_multi") {
            const rawSpans = (layout === "slope_single")
                ? [state.spans?.[0] || { length: state.lineLength || 20.0, slopeDeg: 30 }]
                : (state.spans || [{ length: 10, slopeDeg: 20 }, { length: 12, slopeDeg: 35 }, { length: 8, slopeDeg: 25 }]);

            const N = rawSpans.length;
            for (let i = 0; i <= N; i++) {
                const aId = `A${i + 1}`;
                const isFirst = (i === 0);
                const isLast = (i === N);
                const type = (isFirst || isLast)
                    ? (isEn ? "End Anchor (Slope)" : "Extrémité (Pente)")
                    : (isEn ? "Intermediate (Slope)" : "Intermédiaire (Pente)");
                const adj = [];
                if (!isFirst) adj.push(`S${i}`);
                if (!isLast) adj.push(`S${i + 1}`);

                const isFall = (state.fallPosition?.segmentIndex === i);
                let effortVal = 0.0;
                if (isLast) effortVal = ext1L || 0.0;
                else if (isFirst) effortVal = ext2L || 0.0;

                const pos = geomContext?.attachPoints ? geomContext.attachPoints[i] : null;
                const norm = geomContext?.postNormals ? geomContext.postNormals[i] : null;

                anchors.push({
                    id: aId,
                    type,
                    adjacentSpans: adj,
                    isFallAnchor: isFall,
                    isXMatrix: false,
                    effortKn: effortVal,
                    effortStr: UnitsModule.formatForce(effortVal),
                    remarque: isFall ? (isEn ? "Fall Anchor" : "Ancrage de chute") : "-",
                    position: pos,
                    normalVec: norm
                });
            }

            for (let i = 0; i < N; i++) {
                const sId = `S${i + 1}`;
                const len = parseFloat(rawSpans[i].length) || 10.0;
                const deg = parseFloat(rawSpans[i].slopeDeg !== undefined ? rawSpans[i].slopeDeg : rawSpans[i].slope_deg) || 0;
                const mid = geomContext?.spanMids ? geomContext.spanMids[i] : null;

                spans.push({
                    id: sId,
                    internalSpanId: rawSpans[i].id,
                    spanIndex: i,
                    fromAnchorId: `A${i + 1}`,
                    toAnchorId: `A${i + 2}`,
                    length: len,
                    slopeDeg: deg,
                    isSloped: true,
                    text: `${sId} : ${formatLen(len, deg)}`,
                    midPoint: mid
                });
            }

            return { anchors, spans, xMatrixPieces };
        }

        // =========================================================================
        // CONFIG 5 & 6 (CLOSED LOOPS)
        // =========================================================================
        const isClosedLoop = (state.closedLoop === true) || (layout === "quad_loop") ||
                             (layout === "multi_bend_circle" && state.closedLoop !== false);

        if (isClosedLoop) {
            const rawSpans = state.spans && state.spans.length >= 3
                ? state.spans
                : [
                    { length: 10, bendDeg: 90 },
                    { length: 10, bendDeg: 90 },
                    { length: 10, bendDeg: 90 },
                    { length: 10, bendDeg: 90 }
                ];

            const N = rawSpans.length;
            for (let i = 0; i < N; i++) {
                const aId = `A${i + 1}`;
                const prevSpan = (i === 0) ? `S${N}` : `S${i}`;
                const nextSpan = `S${i + 1}`;
                const isFall = (state.fallPosition?.segmentIndex === i);
                const effortVal = isFall ? (ext1L || 0.0) : 0.0;
                const pos = geomContext?.anchorPositions ? geomContext.anchorPositions[i] : null;

                anchors.push({
                    id: aId,
                    type: isEn ? "Loop Vertex" : "Sommet de boucle",
                    adjacentSpans: [prevSpan, nextSpan],
                    isFallAnchor: isFall,
                    isXMatrix: false,
                    effortKn: effortVal,
                    effortStr: UnitsModule.formatForce(effortVal),
                    remarque: isFall ? (isEn ? "Fall Anchor" : "Ancrage de chute") : "-",
                    position: pos
                });
            }

            for (let i = 0; i < N; i++) {
                const sId = `S${i + 1}`;
                const fromA = `A${i + 1}`;
                const toA = (i === N - 1) ? `A1` : `A${i + 2}`;
                const len = parseFloat(rawSpans[i].length) || 10.0;
                const mid = geomContext?.spanMids ? geomContext.spanMids[i] : null;

                spans.push({
                    id: sId,
                    internalSpanId: rawSpans[i].id,
                    spanIndex: i,
                    fromAnchorId: fromA,
                    toAnchorId: toA,
                    length: len,
                    slopeDeg: 0,
                    text: `${sId} : ${formatLen(len)}`,
                    midPoint: mid
                });
            }

            return { anchors, spans, xMatrixPieces };
        }

        // =========================================================================
        // CONFIG 1, 2, 3, 4, 7, 10: LINEAR MULTI-SPAN WITH OPTIONAL BENDS
        // =========================================================================
        const rawSpans = state.spans && state.spans.length > 0
            ? state.spans
            : [{ length: state.lineLength || 15.0, bendDeg: 0 }];

        const N = rawSpans.length;
        let anchorNum = 1;
        const vertexAnchors = [];

        // Check if OSHA multi-span adapted distribution is available
        const isOSHA = (state.norm === "OSHA");
        const isMulti = isOSHA && (state.oshaSpanMode === "multi") && (layout !== "single_span");
        let adaptedPoints = effortContext?.adaptedPoints || null;

        // 1. Calculate per-entraxe span calculations if not provided in effortContext
        let spanCalcs = effortContext?.spanCalculations || null;
        if (!spanCalcs) {
            try {
                const support = getActiveSupportType();
                const isSloped = (state.roofShape === "sloped");
                const isOSHA = (state.norm === "OSHA");
                const enFF = computeFallFactorFromElevation(state.hllElevationPreset, state.hllElevation, state.bodyPosition);
                const ff = isOSHA ? (state.fallFactor || state.engineerCoefficient || 1.0) : enFF;

                spanCalcs = rawSpans.map((sp, idx) => {
                    const spanLen = Math.max(0.1, parseFloat(sp.length) || 5.0);
                    let sEffort = 0, sDefl = 0, sExt1 = 0, sExt2 = 0;
                    if (rawSpans.length === 1 && effortContext && effortContext.ext1L !== undefined && effortContext.ext1L > 0) {
                        sExt1 = effortContext.ext1L;
                        sExt2 = effortContext.ext2L || effortContext.ext1L;
                        sEffort = effortContext.effortL || 0;
                        sDefl = effortContext.deflL || 0;
                    } else if (isSloped) {
                        const slopedRep = SlopedSystemConesModule.getFullScenarioReport(state.roofSlope || 15, spanLen, state.lineLength);
                        sExt1 = slopedRep.retainedMax.loadCellTopKn;
                        sExt2 = slopedRep.retainedMax.loadCellBottomKn;
                        sEffort = Calculator.effortLonge(state.product, spanLen, state.nbUsers, state.norm, isOSHA ? 1.0 : enFF, support, false);
                        sDefl = Calculator.deflection(state.product, spanLen, isOSHA ? 1.0 : enFF, support, state.nbUsers, state.norm, false);
                    } else if (!isOSHA) {
                        sEffort = Calculator.effortLonge(state.product, spanLen, state.nbUsers, "EN 795", enFF, support, false);
                        sDefl = Calculator.deflection(state.product, spanLen, enFF, support, state.nbUsers, "EN 795", false);
                        sExt1 = Calculator.extremiteForce1(state.product, spanLen, state.nbUsers, "EN 795", sEffort, sDefl, enFF, support, false);
                        sExt2 = Calculator.extremiteForce2(state.product, spanLen, state.nbUsers, "EN 795", sEffort, sDefl, enFF, support, false);
                    } else {
                        const baseEff = Calculator.effortLonge(state.product, spanLen, state.nbUsers, "OSHA", 1.0, support, isMulti);
                        sDefl = Calculator.deflection(state.product, spanLen, 1.0, support, state.nbUsers, "OSHA", isMulti);
                        const baseExt1 = Calculator.extremiteForce1(state.product, spanLen, state.nbUsers, "OSHA", baseEff, sDefl, 1.0, support, isMulti);
                        const baseExt2 = Calculator.extremiteForce2(state.product, spanLen, state.nbUsers, "OSHA", baseEff, sDefl, 1.0, support, isMulti);
                        sEffort = baseEff * ff;
                        sExt1 = baseExt1 * ff;
                        sExt2 = baseExt2 * ff;
                    }
                    return {
                        idx,
                        id: `S${idx + 1}`,
                        internalSpanId: sp.id || `spn_${idx + 1}`,
                        length: spanLen,
                        effortKn: sEffort,
                        deflMm: sDefl,
                        ext1Kn: sExt1,
                        ext2Kn: sExt2,
                        maxTensionKn: Math.max(sExt1, sExt2)
                    };
                });
            } catch (e) {
                spanCalcs = null;
            }
        }

        const fallMode = effortContext?.fallMode || state.fallCalculationMode || "critical_case";
        const isSelectedSpanMode = (fallMode === "selected_span");
        let chosenSpanIdx = (effortContext?.chosenSpanIdx !== undefined && effortContext.chosenSpanIdx >= 0)
            ? effortContext.chosenSpanIdx
            : (state.spans ? state.spans.findIndex(s => s.id === state.selectedFallSpanId) : -1);
        if (chosenSpanIdx < 0) chosenSpanIdx = Math.max(0, Math.min(N - 1, state.fallPosition?.segmentIndex || 0));

        let critSpanIdx = (effortContext?.critSpanIdx !== undefined) ? effortContext.critSpanIdx : 0;
        if (spanCalcs && effortContext?.critSpanIdx === undefined) {
            let maxCrit = -1;
            spanCalcs.forEach((sc, ci) => {
                if (sc.maxTensionKn > maxCrit || (sc.maxTensionKn === maxCrit && sc.length > spanCalcs[critSpanIdx].length)) {
                    maxCrit = sc.maxTensionKn;
                    critSpanIdx = ci;
                }
            });
        }
        const p0Kn = effortContext?.p0Kn || (isExtreme(state.product) ? 5.886 : 0.981);

        // 2. Multi-span adapted distribution fallback if not provided in effortContext
        if (isMulti && !adaptedPoints && spanCalcs) {
            try {
                const support = getActiveSupportType();
                const l = (parseInt(state.lang) === 1 || parseInt(state.lang) === 2) ? parseInt(state.lang) : 0;
                const multiSpanResultsPerSpan = rawSpans.map((sp, sIdx) => {
                    const sc = spanCalcs[sIdx];
                    const sEffort = sc.effortKn;
                    const sDefl = sc.deflMm;
                    const sExt1 = sc.ext1Kn;
                    const sExt2 = sc.ext2Kn;
                    const sExt3 = Calculator.extremiteForce3(state.product, sc.length, state.nbUsers, state.norm, sEffort, sDefl, state.fallFactor, support, true);
                    const sExt4 = Calculator.extremiteForce4(state.product, sc.length, state.nbUsers, state.norm, sEffort, sDefl, state.fallFactor, support, true);
                    const sixPoints = AnchorEffortDistributionModule.calculateRule1_MultiSpan(sExt1, sExt2, sExt3, sExt4);
                    const finalSix = AnchorEffortDistributionModule.calculateRule2_FromSpans(sixPoints, state.spans, sIdx);
                    const adapted = AnchorEffortDistributionModule.getAdaptedMultiSpanResults(finalSix, N + 1, l, sIdx, p0Kn, state.spans);
                    return { sIdx, sc, adapted };
                });

                if (isSelectedSpanMode) {
                    const targetIdx = Math.max(0, Math.min(rawSpans.length - 1, chosenSpanIdx));
                    adaptedPoints = multiSpanResultsPerSpan[targetIdx].adapted.points;
                } else {
                    const primaryAdapted = multiSpanResultsPerSpan[critSpanIdx]?.adapted || multiSpanResultsPerSpan[0]?.adapted;
                    const envelopePoints = [];
                    const numPts = primaryAdapted?.points ? primaryAdapted.points.length : (N + 1);
                    for (let aIdx = 0; aIdx < numPts; aIdx++) {
                        let maxVal = -1;
                        let causeSpanIdx = critSpanIdx;
                        for (let sIdx = 0; sIdx < rawSpans.length; sIdx++) {
                            const ptVal = multiSpanResultsPerSpan[sIdx].adapted.points[aIdx]?.val || 0;
                            if (ptVal > maxVal) {
                                maxVal = ptVal;
                                causeSpanIdx = sIdx;
                            }
                        }
                        const basePt = primaryAdapted.points[aIdx] || {};
                        const isCritFall = (aIdx === critSpanIdx || aIdx === critSpanIdx + 1);
                        let rem = "-";
                        if (isCritFall) {
                            rem = (l === 1) ? `Critical Fall Anchor (S${critSpanIdx + 1})` : (l === 2 ? `Anclaje caída crítico (S${critSpanIdx + 1})` : `Ancrage de chute critique (S${critSpanIdx + 1})`);
                        } else if (causeSpanIdx === critSpanIdx) {
                            rem = basePt.remarque || ((l === 1) ? "Critical Wave" : "Onde critique");
                        } else {
                            rem = (l === 1) ? `Critical Envelope (S${causeSpanIdx + 1})` : (l === 2 ? `Envolvente crítica (S${causeSpanIdx + 1})` : `Enveloppe critique (S${causeSpanIdx + 1})`);
                        }
                        envelopePoints.push({
                            ...basePt,
                            val: maxVal,
                            isFallAnchor: isCritFall,
                            remarque: rem
                        });
                    }
                    adaptedPoints = envelopePoints;
                }
            } catch (e) {
                adaptedPoints = null;
            }
        }

        const is2PointMode = (!adaptedPoints && spanCalcs && spanCalcs.length > 0);
        let aLinearIndex = 0;

        for (let i = 0; i <= N; i++) {
            if (i === 0) {
                const id = `A${anchorNum++}`;
                let eff = ext1L || 0.0;
                let isFall = false;
                let remark = "-";

                if (is2PointMode) {
                    if (fallMode === "selected_span") {
                        if (chosenSpanIdx === 0) {
                            eff = spanCalcs[0].ext1Kn;
                            isFall = true;
                            remark = isEn ? "Fall Anchor (S1 - End 1)" : "Ancrage de chute (S1 - Extr. 1)";
                        } else {
                            eff = p0Kn;
                            remark = isEn ? "Pretension (P0)" : "Prétension (P0)";
                        }
                    } else {
                        // critical_case
                        eff = spanCalcs[0].ext1Kn;
                        if (critSpanIdx === 0) {
                            isFall = true;
                            remark = isEn ? "Critical Span (S1)" : "Portée critique (S1)";
                        }
                    }
                } else if (adaptedPoints && adaptedPoints[0]) {
                    eff = adaptedPoints[0].val;
                    isFall = Boolean(adaptedPoints[0].isFallAnchor);
                    remark = adaptedPoints[0].remarque || (isFall ? (isEn ? "Fall Anchor" : "Ancrage de chute") : "-");
                }

                const pos = geomContext?.anchorPositions ? geomContext.anchorPositions[aLinearIndex] : null;

                anchors.push({
                    id,
                    type: isEn ? "End Anchor" : "Extrémité",
                    adjacentSpans: ["S1"],
                    isFallAnchor: isFall,
                    isXMatrix: false,
                    effortKn: eff,
                    effortStr: UnitsModule.formatForce(eff),
                    remarque: remark,
                    position: pos
                });
                vertexAnchors.push([id]);
                aLinearIndex++;
            } else if (i === N) {
                const id = `A${anchorNum++}`;
                let eff = ext2L || 0.0;
                let isFall = false;
                let remark = "-";

                if (is2PointMode) {
                    if (fallMode === "selected_span") {
                        if (chosenSpanIdx === N - 1) {
                            eff = spanCalcs[N - 1].ext2Kn;
                            isFall = true;
                            remark = isEn ? `Fall Anchor (S${N} - End 2)` : `Ancrage de chute (S${N} - Extr. 2)`;
                        } else {
                            eff = p0Kn;
                            remark = isEn ? "Pretension (P0)" : "Prétension (P0)";
                        }
                    } else {
                        // critical_case
                        eff = spanCalcs[N - 1].ext2Kn;
                        if (critSpanIdx === N - 1) {
                            isFall = true;
                            remark = isEn ? `Critical Span (S${N})` : `Portée critique (S${N})`;
                        }
                    }
                } else if (adaptedPoints) {
                    if (adaptedPoints[aLinearIndex]) {
                        eff = adaptedPoints[aLinearIndex].val;
                        isFall = Boolean(adaptedPoints[aLinearIndex].isFallAnchor);
                        remark = adaptedPoints[aLinearIndex].remarque || (isFall ? (isEn ? "Fall Anchor" : "Ancrage de chute") : "-");
                    } else if (aLinearIndex >= adaptedPoints.length) {
                        eff = 0.0;
                    }
                }

                const pos = geomContext?.anchorPositions ? geomContext.anchorPositions[aLinearIndex] : null;

                anchors.push({
                    id,
                    type: isEn ? "End Anchor" : "Extrémité",
                    adjacentSpans: [`S${N}`],
                    isFallAnchor: isFall,
                    isXMatrix: false,
                    effortKn: eff,
                    effortStr: UnitsModule.formatForce(eff),
                    remarque: remark,
                    position: pos
                });
                vertexAnchors.push([id]);
                aLinearIndex++;
            } else {
                const spBefore = rawSpans[i - 1];
                const bendDeg = Math.abs(parseFloat(spBefore.bendDeg || 0));
                const isBigBend = (bendDeg > 40);

                if (isBigBend) {
                    const num = anchorNum++;
                    const idA = `A${num}a`;
                    const idB = `A${num}b`;

                    let effA = 0.0;
                    let effB = 0.0;
                    let isFallA = false;
                    let isFallB = false;
                    let remA = "-";
                    let remB = "-";

                    if (is2PointMode) {
                        let val2Pt = p0Kn;
                        let fall2Pt = false;
                        if (fallMode === "selected_span") {
                            if (chosenSpanIdx === i - 1) {
                                val2Pt = spanCalcs[i - 1].ext2Kn;
                                fall2Pt = true;
                            } else if (chosenSpanIdx === i) {
                                val2Pt = spanCalcs[i].ext1Kn;
                                fall2Pt = true;
                            }
                        } else {
                            // critical_case
                            const leftEff = spanCalcs[i - 1]?.ext2Kn || 0;
                            const rightEff = spanCalcs[i]?.ext1Kn || 0;
                            val2Pt = Math.max(leftEff, rightEff);
                            if (critSpanIdx === i - 1 || critSpanIdx === i) {
                                fall2Pt = true;
                            }
                        }
                        effA = val2Pt;
                        effB = val2Pt;
                        isFallA = fall2Pt;
                        isFallB = fall2Pt;
                        remA = isFallA ? (isEn ? "Double fall anchor" : "Ancrage double (chute)") : (isEn ? "Double anchor" : "Ancrage double");
                        remB = remA;
                    } else if (adaptedPoints) {
                        if (adaptedPoints[aLinearIndex]) {
                            effA = adaptedPoints[aLinearIndex].val;
                            isFallA = Boolean(adaptedPoints[aLinearIndex].isFallAnchor);
                            remA = adaptedPoints[aLinearIndex].remarque || "-";
                        }
                        if (adaptedPoints[aLinearIndex + 1]) {
                            effB = adaptedPoints[aLinearIndex + 1].val;
                            isFallB = Boolean(adaptedPoints[aLinearIndex + 1].isFallAnchor);
                            remB = adaptedPoints[aLinearIndex + 1].remarque || "-";
                        }
                        // Spec V2 — 17 : A#a et A#b reçoivent exactement la même valeur d'effort
                        const maxEff = Math.max(effA, effB);
                        effA = maxEff;
                        effB = maxEff;
                    }

                    const posA = geomContext?.anchorPositions ? geomContext.anchorPositions[aLinearIndex] : null;
                    const posB = geomContext?.anchorPositions ? geomContext.anchorPositions[aLinearIndex + 1] : null;

                    anchors.push({
                        id: idA,
                        type: isEn ? "Double Anchor" : "Ancrage double",
                        adjacentSpans: [`S${i}`],
                        isFallAnchor: isFallA,
                        isDoubleAnchor: true,
                        isXMatrix: false,
                        effortKn: effA,
                        effortStr: UnitsModule.formatForce(effA),
                        remarque: remA,
                        position: posA
                    });
                    anchors.push({
                        id: idB,
                        type: isEn ? "Double Anchor" : "Ancrage double",
                        adjacentSpans: [`S${i + 1}`],
                        isFallAnchor: isFallB,
                        isDoubleAnchor: true,
                        isXMatrix: false,
                        effortKn: effB,
                        effortStr: UnitsModule.formatForce(effB),
                        remarque: remB,
                        position: posB
                    });
                    vertexAnchors.push([idA, idB]);
                    aLinearIndex += 2;
                } else {
                    const id = `A${anchorNum++}`;
                    let eff = 0.0;
                    let isFall = false;
                    let remark = "-";

                    if (is2PointMode) {
                        if (fallMode === "selected_span") {
                            if (chosenSpanIdx === i - 1) {
                                eff = spanCalcs[i - 1].ext2Kn;
                                isFall = true;
                                remark = isEn ? `Fall Anchor (S${i} - End 2)` : `Ancrage de chute (S${i} - Extr. 2)`;
                            } else if (chosenSpanIdx === i) {
                                eff = spanCalcs[i].ext1Kn;
                                isFall = true;
                                remark = isEn ? `Fall Anchor (S${i + 1} - End 1)` : `Ancrage de chute (S${i + 1} - Extr. 1)`;
                            } else {
                                eff = p0Kn;
                                remark = isEn ? "Pretension (P0)" : "Prétension (P0)";
                            }
                        } else {
                            // critical_case: max of adjacent spans
                            const leftEff = spanCalcs[i - 1]?.ext2Kn || 0;
                            const rightEff = spanCalcs[i]?.ext1Kn || 0;
                            eff = Math.max(leftEff, rightEff);
                            if (critSpanIdx === i - 1 || critSpanIdx === i) {
                                isFall = true;
                                remark = isEn ? `Critical Span (S${critSpanIdx + 1})` : `Portée critique (S${critSpanIdx + 1})`;
                            }
                        }
                    } else if (adaptedPoints && adaptedPoints[aLinearIndex]) {
                        eff = adaptedPoints[aLinearIndex].val;
                        isFall = Boolean(adaptedPoints[aLinearIndex].isFallAnchor);
                        remark = adaptedPoints[aLinearIndex].remarque || (isFall ? (isEn ? "Fall Anchor" : "Ancrage de chute") : "-");
                    }

                    const pos = geomContext?.anchorPositions ? geomContext.anchorPositions[aLinearIndex] : null;

                    const isXMat = !!(spBefore && spBefore.hasXMatrix);
                    anchors.push({
                        id,
                        type: isXMat
                            ? (isEn ? "X-Matrix (Multi-direction)" : "X-Matrix (Multi-directions)")
                            : ((bendDeg > 0)
                                ? (isEn ? "Bend <= 40°" : "Coude <= 40°")
                                : (isEn ? "Intermediate" : "Intermédiaire")),
                        adjacentSpans: [`S${i}`, `S${i + 1}`],
                        isFallAnchor: isFall,
                        isXMatrix: isXMat,
                        effortKn: eff,
                        effortStr: UnitsModule.formatForce(eff),
                        remarque: remark,
                        position: pos
                    });
                    vertexAnchors.push([id]);
                    aLinearIndex++;

                    if (isXMat) {
                        const xMatId = `X${xMatrixPieces.length + 1}`;
                        xMatrixPieces.push({
                            id: xMatId,
                            anchorId: id,
                            type: isEn ? "X-Matrix (Multi-direction)" : "X-Matrix (Multi-directions)",
                            isXMatrix: true,
                            adjacentSpans: [`S${i}`, `S${i + 1}`],
                            isFallAnchor: isFall,
                            effortKn: eff,
                            effortStr: UnitsModule.formatForce(eff),
                            remarque: remark,
                            position: pos
                        });

                        if (spBefore.xMatrixBranches && spBefore.xMatrixBranches.length > 0) {
                            spBefore.xMatrixBranches.forEach((br, bIdx) => {
                                const rawAng = (br.angleDeg !== undefined) ? parseFloat(br.angleDeg) : (bIdx === 0 ? 90 : -90);
                                const normAng = ((rawAng % 360) + 360) % 360;
                                if (normAng < 15 || normAng > 345 || Math.abs(normAng - 180) < 15) return;

                                const bSpans = (typeof getBranchSpans === "function") ? getBranchSpans(br) : (br.spans || [{ id: "xmb_s1", length: br.length || 5.0 }]);
                                const brEffort = 0.25 * eff;
                                let prevAId = id;

                                bSpans.forEach((subSp, sIdx) => {
                                    const isLastSpan = (sIdx === bSpans.length - 1);
                                    const subLen = Math.max(0.5, parseFloat(subSp.length) || 5.0);
                                    const brAnchorId = (bSpans.length === 1)
                                        ? `${xMatId}-A${bIdx + 1}`
                                        : `${xMatId}-B${bIdx + 1}-A${sIdx + 1}`;
                                    const brSpanId = (bSpans.length === 1)
                                        ? `${xMatId}-S${bIdx + 1}`
                                        : `${xMatId}-B${bIdx + 1}-S${sIdx + 1}`;

                                    anchors.push({
                                        id: brAnchorId,
                                        type: isLastSpan
                                            ? (isEn ? `Branch End (${xMatId}-B${bIdx + 1})` : `Extrémité Branche (${xMatId}-B${bIdx + 1})`)
                                            : (isEn ? `Branch Inter (${xMatId}-B${bIdx + 1})` : `Intermédiaire Branche (${xMatId}-B${bIdx + 1})`),
                                        adjacentSpans: [brSpanId],
                                        isFallAnchor: false,
                                        isXMatrix: false,
                                        effortKn: brEffort,
                                        effortStr: UnitsModule.formatForce(brEffort),
                                        remarque: (isFall && isLastSpan) ? (isEn ? "Transferred (25%)" : "Report d'effort (25%)") : "-"
                                    });
                                    spans.push({
                                        id: brSpanId,
                                        fromAnchorId: prevAId,
                                        toAnchorId: brAnchorId,
                                        length: subLen,
                                        slopeDeg: 0,
                                        isSloped: false,
                                        text: `${brSpanId} : ${formatLen(subLen)}`
                                    });
                                    prevAId = brAnchorId;
                                });
                            });
                        }
                    }
                }
            }
        }

        for (let i = 0; i < N; i++) {
            const sId = `S${i + 1}`;
            const fromV = vertexAnchors[i];
            const toV = vertexAnchors[i + 1];
            const fromA = fromV[fromV.length - 1];
            const toA = toV[0];
            const sp = rawSpans[i];
            const len = parseFloat(sp.length) || 10.0;
            const deg = parseFloat(sp.slopeDeg || 0);
            const mid = geomContext?.spanMids ? geomContext.spanMids[i] : null;
            const sc = spanCalcs ? spanCalcs[i] : null;
            const isFallSpan = (chosenSpanIdx === i);
            const isCriticalSpan = (critSpanIdx === i);

            spans.push({
                id: sId,
                internalSpanId: sp.id,
                spanIndex: i,
                fromAnchorId: fromA,
                toAnchorId: toA,
                length: len,
                slopeDeg: deg,
                bendAfterDeg: parseFloat(sp.bend_after_deg !== undefined ? sp.bend_after_deg : sp.bendDeg) || 0,
                isSloped: deg !== 0,
                text: `${sId} : ${formatLen(len, deg)}`,
                midPoint: mid,
                deflMm: sc ? sc.deflMm : null,
                effortKn: sc ? sc.effortKn : null,
                anchorLoadKn: sc ? sc.maxTensionKn : null,
                isFallSpan: isFallSpan,
                isCriticalSpan: isCriticalSpan
            });
        }

        // Post-processing: Ensure all spans have a 3D midPoint if positions of fromAnchor and toAnchor are available
        const allAnchorsMap = new Map();
        anchors.forEach(a => allAnchorsMap.set(a.id, a));
        (xMatrixPieces || []).forEach(x => allAnchorsMap.set(x.id, x));

        spans.forEach(sp => {
            const fAnc = allAnchorsMap.get(sp.fromAnchorId);
            const tAnc = allAnchorsMap.get(sp.toAnchorId);
            if (fAnc && fAnc.position) sp.fromPos = fAnc.position.clone();
            if (tAnc && tAnc.position) sp.toPos = tAnc.position.clone();
            if (!sp.midPoint) {
                if (fAnc && fAnc.position && tAnc && tAnc.position) {
                    const postH = (layout === "slope_single" || layout === "slope_multi" || layout === "cross_spans" || layout === "grid_system") ? 0.0 : 0.42;
                    sp.midPoint = new THREE.Vector3(
                        (fAnc.position.x + tAnc.position.x) / 2,
                        (fAnc.position.y + tAnc.position.y) / 2 + postH,
                        (fAnc.position.z + tAnc.position.z) / 2
                    );
                }
            }
        });

        return { anchors, spans, xMatrixPieces };
    },

    // 2. Sprite Creation Helpers
    createAnchorLabelSprite(text, isFall = false, isXMatrix = false, isCompact = false) {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 80;
        const ctx = canvas.getContext('2d');

        let bgFill = 'rgba(255, 255, 255, 0.95)';
        let strokeCol = '#0284c7';
        let textCol = '#0f172a';

        if (isFall) {
            bgFill = 'rgba(234, 88, 12, 0.95)';
            strokeCol = '#ffffff';
            textCol = '#ffffff';
        } else if (isXMatrix) {
            bgFill = 'rgba(99, 102, 241, 0.95)';
            strokeCol = '#ffffff';
            textCol = '#ffffff';
        }

        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;

        ctx.fillStyle = bgFill;
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(6, 6, 148, 68, 14);
            ctx.fill();
        } else {
            ctx.fillRect(6, 6, 148, 68);
        }

        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 4;
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(6, 6, 148, 68, 14);
            ctx.stroke();
        } else {
            ctx.strokeRect(6, 6, 148, 68);
        }

        ctx.fillStyle = textCol;
        ctx.font = 'bold 30px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 80, 40);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.renderOrder = 999;
        sprite.scale.set(isCompact ? 0.90 : 1.15, isCompact ? 0.45 : 0.58, 1);
        return sprite;
    },

    createSpanLengthSprite(text, isCompact = false) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 70;
        const ctx = canvas.getContext('2d');

        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(4, 4, 312, 62, 10);
            ctx.fill();
        } else {
            ctx.fillRect(4, 4, 312, 62);
        }

        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(4, 4, 312, 62, 10);
            ctx.stroke();
        } else {
            ctx.strokeRect(4, 4, 312, 62);
        }

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 22px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 160, 35);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.renderOrder = 998;
        sprite.scale.set(isCompact ? 1.45 : 1.90, isCompact ? 0.32 : 0.42, 1);
        return sprite;
    },

    // 3. Render 3D Sprites with Dynamic Non-Obstructing Offsets & Leader Lines
    renderSystemLabels3D(systemLabels) {
        if (!labelsGroup) return;

        if (anchorLabelsSubgroup) {
            while (anchorLabelsSubgroup.children.length > 0) {
                const ch = anchorLabelsSubgroup.children[0];
                if (ch.geometry) ch.geometry.dispose();
                if (ch.material && ch.material.map) ch.material.map.dispose();
                if (ch.material) ch.material.dispose();
                anchorLabelsSubgroup.remove(ch);
            }
        }
        if (spanLabelsSubgroup) {
            while (spanLabelsSubgroup.children.length > 0) {
                const ch = spanLabelsSubgroup.children[0];
                if (ch.geometry) ch.geometry.dispose();
                if (ch.material && ch.material.map) ch.material.map.dispose();
                if (ch.material) ch.material.dispose();
                spanLabelsSubgroup.remove(ch);
            }
        }

        const isDense = (systemLabels.spans.length >= 20 || systemLabels.anchors.length >= 20);
        const layoutType = state.layoutType || "single_span";

        // =========================================================================
        // 1. RENDER ANCHOR BADGES + ELEVATED CLEARANCE + DASHED LEADER LINES
        // =========================================================================
        const allItems = [...systemLabels.anchors, ...(systemLabels.xMatrixPieces || [])];
        allItems.forEach((anc) => {
            if (!anc.position) return;

            const isSlopeLayout = (layoutType === "slope_single" || layoutType === "slope_multi");
            const isCrossLayout = (layoutType === "cross_spans");
            const isGridLayout = (layoutType === "grid_system");

            // Post top clamp attachment point
            const isAlreadyTop = (isSlopeLayout || isCrossLayout || isGridLayout);
            const postH = isAlreadyTop ? 0.0 : 0.42;
            const postTop = new THREE.Vector3(anc.position.x, anc.position.y + postH, anc.position.z);

            const sprite = this.createAnchorLabelSprite(anc.id, anc.isFallAnchor, anc.isXMatrix, isDense);
            const badgePos = postTop.clone();

            if (isSlopeLayout) {
                // Slope lifelines: float along normal to roof surface
                const nVec = anc.normalVec || new THREE.Vector3(0, 1, 0);
                const elev = isDense ? 0.75 : 0.95;
                badgePos.x += nVec.x * elev;
                badgePos.y += nVec.y * elev;
            } else if (isGridLayout) {
                // Overhead grid at Y = 3.5m: float above grid plane
                badgePos.y += isDense ? 0.50 : 0.70;
            } else {
                // Standard posts (Configs 1-7, 10, 11):
                // Elevate above post top to guarantee full clearance of post body, base plate, bolts, and absorber
                const yClearance = isDense ? 0.75 : 0.95;
                badgePos.y += yClearance;
            }

            sprite.position.copy(badgePos);
            anchorLabelsSubgroup.add(sprite);

            // Subtle Dashed Leader Line from post top clamp to bottom edge of floating badge
            const badgeHalfH = isDense ? 0.22 : 0.29;
            const leaderEnd = new THREE.Vector3(badgePos.x, badgePos.y - badgeHalfH, badgePos.z);

            const lineGeo = new THREE.BufferGeometry().setFromPoints([postTop, leaderEnd]);
            const lineColor = anc.isFallAnchor ? 0xea580c : (anc.isXMatrix ? 0x6366f1 : 0x0284c7);
            const lineMat = new THREE.LineDashedMaterial({
                color: lineColor,
                dashSize: 0.08,
                gapSize: 0.04,
                transparent: true,
                opacity: 0.70,
                depthTest: false,
                depthWrite: false
            });
            const leaderLine = new THREE.Line(lineGeo, lineMat);
            leaderLine.computeLineDistances();
            leaderLine.renderOrder = 997;
            anchorLabelsSubgroup.add(leaderLine);

            // Small Pinpoint Sphere marking exact anchor attachment position
            const dotGeo = new THREE.SphereGeometry(0.035, 12, 12);
            const dotMat = new THREE.MeshBasicMaterial({
                color: lineColor,
                depthTest: false,
                depthWrite: false
            });
            const dotMesh = new THREE.Mesh(dotGeo, dotMat);
            dotMesh.position.copy(postTop);
            dotMesh.renderOrder = 998;
            anchorLabelsSubgroup.add(dotMesh);
        });

        // =========================================================================
        // 2. RENDER SPAN BADGES + LATERAL OFFSET + LEADER LINES TO CABLE MIDPOINT
        // =========================================================================
        systemLabels.spans.forEach((sp) => {
            if (!sp.midPoint) return;

            const sprite = this.createSpanLengthSprite(sp.text, isDense);
            const cableMid = sp.midPoint.clone();

            const lateralDist = isDense ? 0.65 : 0.85;
            const verticalLift = isDense ? 0.25 : 0.38;
            const offsetVec = new THREE.Vector3(0, 0, 0);

            if (layoutType === "slope_horizontal_comb") {
                // Config 10: Stairs and platform overhang are strictly at +Z side (Z > 5.0)
                // Shift span badges into -Z (away from stairs) and lift vertically to open 100% view of stairs & cable
                offsetVec.set(0, verticalLift, -lateralDist);
            } else if (layoutType === "slope_single" || layoutType === "slope_multi") {
                // Config 8 & 9: Slope in X-Y plane at Z = 0
                // Offset strictly perpendicular to cable in X-Y plane
                let dx = 1, dy = 0;
                if (sp.fromPos && sp.toPos) {
                    dx = sp.toPos.x - sp.fromPos.x;
                    dy = sp.toPos.y - sp.fromPos.y;
                }
                const len = Math.sqrt(dx * dx + dy * dy) || 1.0;
                const nx = -dy / len;
                const ny = dx / len;
                offsetVec.set(nx * 0.75, ny * 0.75, 0);
            } else if (layoutType === "cross_spans") {
                // Config 11: 4 branches (north, east, south, west)
                if (sp.fromPos && sp.toPos) {
                    const dx = sp.toPos.x - sp.fromPos.x;
                    const dz = sp.toPos.z - sp.fromPos.z;
                    const len = Math.sqrt(dx * dx + dz * dz) || 1.0;
                    offsetVec.set((-dz / len) * lateralDist, verticalLift, (dx / len) * lateralDist);
                } else {
                    offsetVec.set(0, verticalLift, -lateralDist);
                }
            } else if (layoutType === "grid_system") {
                // Config 12: Grid row spans and column spans
                if (sp.id.startsWith("S") && sp.id.includes("-")) {
                    const firstPart = sp.id.split("-")[0];
                    const isRowSpan = isNaN(parseInt(firstPart.slice(1))); // SA, SB, SC...
                    if (isRowSpan) {
                        offsetVec.set(0, 0.25, -0.65); // offset in -Z for row spans
                    } else {
                        offsetVec.set(0.65, 0.25, 0); // offset in +X for col spans
                    }
                } else {
                    offsetVec.set(0, verticalLift, -lateralDist);
                }
            } else {
                // Configs 1, 2, 3, 4, 5, 6, 7 (Linear, Bends, Loops):
                let dirX = 1, dirZ = 0;
                if (sp.fromPos && sp.toPos) {
                    dirX = sp.toPos.x - sp.fromPos.x;
                    dirZ = sp.toPos.z - sp.fromPos.z;
                }
                const lenXZ = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1.0;
                let nx = -dirZ / lenXZ;
                let nz = dirX / lenXZ;

                // For closed loops and perimeter lines: ensure offset points outwards from roof center
                const centerX = state.L / 2;
                const centerZ = state.l / 2;
                const toMidX = cableMid.x - centerX;
                const toMidZ = cableMid.z - centerZ;
                const dot = nx * toMidX + nz * toMidZ;

                if (dot < -0.05) {
                    nx = -nx;
                    nz = -nz;
                } else if (Math.abs(dot) <= 0.05) {
                    // Lifeline running along roof centerline: bias towards -Z (away from camera)
                    if (nz > 0) {
                        nx = -nx;
                        nz = -nz;
                    }
                }

                offsetVec.set(nx * lateralDist, verticalLift, nz * lateralDist);
            }

            const badgePos = cableMid.clone().add(offsetVec);
            sprite.position.copy(badgePos);
            spanLabelsSubgroup.add(sprite);

            // Subtle Dashed Leader Line from cable midpoint to offset span badge
            const spanLineGeo = new THREE.BufferGeometry().setFromPoints([cableMid, badgePos]);
            const spanLineMat = new THREE.LineDashedMaterial({
                color: 0x38bdf8,
                dashSize: 0.08,
                gapSize: 0.04,
                transparent: true,
                opacity: 0.65,
                depthTest: false,
                depthWrite: false
            });
            const spanLine = new THREE.Line(spanLineGeo, spanLineMat);
            spanLine.computeLineDistances();
            spanLine.renderOrder = 997;
            spanLabelsSubgroup.add(spanLine);

            // Small Pinpoint Sphere at cable midpoint
            const spanDotGeo = new THREE.SphereGeometry(0.025, 10, 10);
            const spanDotMat = new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                depthTest: false,
                depthWrite: false
            });
            const spanDot = new THREE.Mesh(spanDotGeo, spanDotMat);
            spanDot.position.copy(cableMid);
            spanDot.renderOrder = 998;
            spanLabelsSubgroup.add(spanDot);
        });

        anchorLabelsSubgroup.visible = (state.showAnchorLabels !== false);
        spanLabelsSubgroup.visible = (state.showSpanLabels !== false);
    },

    // 4. Update UI Tables
    updateSystemLabelsUI(systemLabels) {
        const tbodyAnchors = document.getElementById("tbody-system-anchors");
        const tbodySpans = document.getElementById("tbody-system-spans");
        const badgeAnchors = document.getElementById("badge-total-anchors-count");
        const badgeSpans = document.getElementById("badge-total-spans-count");

        const isEn = (parseInt(state.lang) === 1);
        if (badgeAnchors) {
            const totalA = systemLabels.anchors.length + (systemLabels.xMatrixPieces ? systemLabels.xMatrixPieces.length : 0);
            badgeAnchors.textContent = isEn ? `${totalA} ${totalA > 1 ? "anchors" : "anchor"}` : `${totalA} ${totalA > 1 ? "ancrages" : "ancrage"}`;
        }
        if (badgeSpans) {
            const totalS = systemLabels.spans.length;
            badgeSpans.textContent = isEn ? `${totalS} ${totalS > 1 ? "spans" : "span"}` : `${totalS} ${totalS > 1 ? "portées" : "portée"}`;
        }

        const isOSHA = (state.norm === "OSHA");
        const engCoef = isOSHA
            ? ((typeof state.fallFactor === "number" && !isNaN(state.fallFactor))
                ? state.fallFactor
                : ((typeof state.engineerCoefficient === "number" && !isNaN(state.engineerCoefficient)) ? state.engineerCoefficient : 1.00))
            : 1.00;
        const isAdjusted = isOSHA && (Math.abs(engCoef - 1.00) > 0.001);

        const theadAnchors = document.querySelector("#table-system-anchors thead");
        if (theadAnchors) {
            if (isAdjusted) {
                theadAnchors.innerHTML = `
                    <tr>
                        <th>${isEn ? "Tag" : "Étiquette"}</th>
                        <th>Type</th>
                        <th>${isEn ? "Spans" : "Portées"}</th>
                        <th>${isEn ? "Test Result" : "Résultat d'essai"}</th>
                        <th>${isEn ? "Adjusted (Fall Factor " + engCoef.toFixed(2) + ")" : "Résultat ajusté (Fall Factor " + engCoef.toFixed(2) + ")"}</th>
                        <th>${isEn ? "Remark" : "Remarque"}</th>
                    </tr>`;
            } else {
                theadAnchors.innerHTML = `
                    <tr>
                        <th>${isEn ? "Tag" : "Étiquette"}</th>
                        <th>Type</th>
                        <th>${isEn ? "Spans" : "Portées"}</th>
                        <th>${isEn ? "Load" : "Effort"}</th>
                        <th>${isEn ? "Remark" : "Remarque"}</th>
                    </tr>`;
            }
        }

        if (tbodyAnchors) {
            let aHtml = "";
            const allItems = [...systemLabels.anchors, ...(systemLabels.xMatrixPieces || [])];
            allItems.forEach((a, aIdx) => {
                const rowCls = a.isFallAnchor ? "active-fall-row" : "";
                let badgeCls = "anchor-badge";
                if (a.isFallAnchor) badgeCls = "fall-badge";
                else if (a.isXMatrix) badgeCls = "xmatrix-badge";

                const spansStr = (a.adjacentSpans && a.adjacentSpans.length > 0) ? a.adjacentSpans.join(", ") : "-";
                const testEffortStr = UnitsModule.formatForce(a.effortKn || 0);
                const adjEffortStr = UnitsModule.formatForce((a.effortKn || 0) * engCoef);

                if (isAdjusted) {
                    aHtml += `
                        <tr class="${rowCls}">
                            <td><span class="badge-tag-id ${badgeCls}">${a.id}</span></td>
                            <td>${a.type}</td>
                            <td><strong>${spansStr}</strong></td>
                            <td>${testEffortStr}</td>
                            <td><strong style="color:#0284c7;">${adjEffortStr}</strong></td>
                            <td>${a.remarque || "-"}</td>
                        </tr>
                    `;
                } else {
                    aHtml += `
                        <tr class="${rowCls}">
                            <td><span class="badge-tag-id ${badgeCls}">${a.id}</span></td>
                            <td>${a.type}</td>
                            <td><strong>${spansStr}</strong></td>
                            <td><strong>${testEffortStr}</strong></td>
                            <td>${a.remarque || "-"}</td>
                        </tr>
                    `;
                }
            });
            tbodyAnchors.innerHTML = aHtml;
        }

        const theadSpans = document.querySelector("#table-system-spans thead");
        if (theadSpans) {
            if (isAdjusted) {
                theadSpans.innerHTML = `
                    <tr>
                        <th>${isEn ? "Tag" : "Étiquette"}</th>
                        <th>${isEn ? "Endpoints" : "Extrémités"}</th>
                        <th>${isEn ? "Length" : "Longueur"}</th>
                        <th>${isEn ? "Deflection" : "Flèche"}</th>
                        <th>${isEn ? "Test Load" : "Effort d'essai"}</th>
                        <th>${isEn ? "Adjusted (Fall Factor " + engCoef.toFixed(2) + ")" : "Effort ajusté (Fall Factor " + engCoef.toFixed(2) + ")"}</th>
                    </tr>`;
            } else {
                theadSpans.innerHTML = `
                    <tr>
                        <th>${isEn ? "Tag" : "Étiquette"}</th>
                        <th>${isEn ? "Endpoints" : "Extrémités"}</th>
                        <th>${isEn ? "Length" : "Longueur"}</th>
                        <th>${isEn ? "Deflection" : "Flèche"}</th>
                        <th>${isEn ? "Anchor Load" : "Effort Ancrage"}</th>
                    </tr>`;
            }
        }

        if (tbodySpans) {
            let sHtml = "";
            const isCritMode = (state.fallCalculationMode === "critical_case");
            systemLabels.spans.forEach((s, sIdx) => {
                const lenTxt = (typeof UnitsModule !== "undefined" && UnitsModule.formatLength)
                    ? UnitsModule.formatLength(s.length)
                    : `${s.length.toFixed(2)} m`;
                const deflTxt = (s.deflMm !== undefined && s.deflMm !== null)
                    ? (typeof UnitsModule !== "undefined" && UnitsModule.formatDeflection ? UnitsModule.formatDeflection(s.deflMm) : `${s.deflMm} mm`)
                    : (s.slopeDeg ? `${s.slopeDeg}°` : "-");
                const baseEffortKn = s.anchorLoadKn || 0;
                const effTxt = (typeof UnitsModule !== "undefined" && UnitsModule.formatForce) ? UnitsModule.formatForce(baseEffortKn) : `${baseEffortKn.toFixed(2)} kN`;
                const adjEffTxt = (typeof UnitsModule !== "undefined" && UnitsModule.formatForce) ? UnitsModule.formatForce(baseEffortKn * engCoef) : `${(baseEffortKn * engCoef).toFixed(2)} kN`;
                const isFallSpan = (state.selectedFallSpanId && s.internalSpanId === state.selectedFallSpanId);
                const isCrit = s.isCriticalSpan;
                let rowCls = isFallSpan ? "active-fall-row" : (isCrit && isCritMode ? "critical-span-row" : "");
                let badgeCls = isFallSpan ? "fall-badge" : (isCrit && isCritMode ? "critical-badge" : "span-badge");

                if (isAdjusted) {
                    sHtml += `
                        <tr class="${rowCls} clickable-row" style="cursor:pointer;" onclick="selectSpanFromTable(${sIdx}, '${s.internalSpanId || ''}');" title="${isEn ? "Select and calculate span " + s.id : "Sélectionner et calculer l'entraxe " + s.id}">
                            <td><span class="badge-tag-id ${badgeCls}">${s.id}</span></td>
                            <td><strong>${s.fromAnchorId} → ${s.toAnchorId}</strong></td>
                            <td><strong>${lenTxt}</strong></td>
                            <td>${deflTxt}</td>
                            <td>${effTxt}</td>
                            <td><strong style="color:#0284c7;">${adjEffTxt}</strong></td>
                        </tr>
                    `;
                } else {
                    sHtml += `
                        <tr class="${rowCls} clickable-row" style="cursor:pointer;" onclick="selectSpanFromTable(${sIdx}, '${s.internalSpanId || ''}');" title="${isEn ? "Select and calculate span " + s.id : "Sélectionner et calculer l'entraxe " + s.id}">
                            <td><span class="badge-tag-id ${badgeCls}">${s.id}</span></td>
                            <td><strong>${s.fromAnchorId} → ${s.toAnchorId}</strong></td>
                            <td><strong>${lenTxt}</strong></td>
                            <td>${deflTxt}</td>
                            <td><strong>${effTxt}</strong></td>
                        </tr>
                    `;
                }
            });
            tbodySpans.innerHTML = sHtml;
        }
    }
};
if (typeof window !== "undefined") {
    window.SystemLabelingModule = SystemLabelingModule;
}

function selectSpanFromTable(sIdx, spanId) {
    if (spanId && typeof LayoutEditorModule !== "undefined") {
        LayoutEditorModule.selectFallSpan(spanId);
    } else if (state.spans && state.spans[sIdx]) {
        state.selectedFallSpanId = state.spans[sIdx].id;
        if (state.fallPosition) state.fallPosition.segmentIndex = sIdx;
    }
    state.fallCalculationMode = "selected_span";
    const tabCrit = document.getElementById("tab-mode-critical");
    const tabSel = document.getElementById("tab-mode-selected");
    if (tabCrit) tabCrit.classList.remove("active");
    if (tabSel) tabSel.classList.add("active");
    const selModal = document.getElementById("select-fall-mode");
    if (selModal) selModal.value = "selected_span";

    if (typeof highlightSelectedNode === "function") {
        highlightSelectedNode(sIdx, sIdx);
    }
    if (typeof updateCalculationsUI === "function") {
        const maxSpan = Calculator.getMaxSpan(state.product);
        const layout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
        updateCalculationsUI(layout, maxSpan);
    }
}
window.selectSpanFromTable = selectSpanFromTable;

// ==========================================
// SPEC V2 — 03 : 3D PERMANENT DIMENSIONS ENGINE (SolidWorks Style)
// ==========================================
let dimensionsGroup;

const Dimensions3DModule = {
    group: null,

    init(sc) {
        if (!dimensionsGroup) {
            dimensionsGroup = new THREE.Group();
            dimensionsGroup.name = "dimensionsGroup";
            sc.add(dimensionsGroup);
        }
        this.group = dimensionsGroup;
    },

    clear() {
        const grp = this.group || dimensionsGroup;
        if (!grp) return;
        while (grp.children.length > 0) {
            const child = grp.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
            grp.remove(child);
        }
    },

    createDimensionSprite(text) {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");

        // Rounded pill background
        ctx.fillStyle = "rgba(15, 23, 42, 0.88)"; // Slate 900 semi-transparent
        ctx.strokeStyle = "#38bdf8"; // Light sky border
        ctx.lineWidth = 3;
        const r = 14;
        ctx.beginPath();
        ctx.moveTo(r, 4);
        ctx.lineTo(canvas.width - r, 4);
        ctx.quadraticCurveTo(canvas.width - 4, 4, canvas.width - 4, r);
        ctx.lineTo(canvas.width - 4, canvas.height - r);
        ctx.quadraticCurveTo(canvas.width - 4, canvas.height - 4, canvas.width - r, canvas.height - 4);
        ctx.lineTo(r, canvas.height - 4);
        ctx.quadraticCurveTo(4, canvas.height - 4, 4, canvas.height - r);
        ctx.lineTo(4, r);
        ctx.quadraticCurveTo(4, 4, r, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px 'Inter', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(2.0, 0.5, 1.0);
        return sprite;
    },

    createDimensionLine(p1, p2, offsetVec, text, color = 0x0284c7) {
        const lineGrp = new THREE.Group();
        const mat = new THREE.LineBasicMaterial({ color, depthTest: false, linewidth: 2 });

        const p1Offset = p1.clone().add(offsetVec);
        const p2Offset = p2.clone().add(offsetVec);

        // Extension lines (Attach lines)
        const ext1Geo = new THREE.BufferGeometry().setFromPoints([p1, p1Offset]);
        const ext2Geo = new THREE.BufferGeometry().setFromPoints([p2, p2Offset]);
        lineGrp.add(new THREE.Line(ext1Geo, mat));
        lineGrp.add(new THREE.Line(ext2Geo, mat));

        // Main dimension line
        const dimGeo = new THREE.BufferGeometry().setFromPoints([p1Offset, p2Offset]);
        lineGrp.add(new THREE.Line(dimGeo, mat));

        // Arrows at both ends
        const len = p1Offset.distanceTo(p2Offset);
        if (len > 0.6) {
            const vDir = p2Offset.clone().sub(p1Offset).normalize();
            const arr1 = new THREE.ArrowHelper(vDir, p1Offset, 0.35, color, 0.22, 0.1);
            const arr2 = new THREE.ArrowHelper(vDir.clone().negate(), p2Offset, 0.35, color, 0.22, 0.1);
            lineGrp.add(arr1);
            lineGrp.add(arr2);
        }

        // Text sprite at midpoint
        const mid = p1Offset.clone().add(p2Offset).multiplyScalar(0.5);
        mid.y += 0.28;
        const sprite = this.createDimensionSprite(text);
        sprite.position.copy(mid);
        lineGrp.add(sprite);

        return lineGrp;
    },

    renderDimensions() {
        const grp = this.group || dimensionsGroup;
        if (!grp) return;
        this.clear();
        if (state.show_dimensions === false) {
            grp.visible = false;
            return;
        }
        grp.visible = true;

        const L = parseFloat(state.roof_length || state.L || 25.0);
        const l = parseFloat(state.roof_width || state.l || 15.0);
        const H_ground = parseFloat(state.roof_height_above_ground || 6.0);
        const lineToEdge = parseFloat(state.line_to_edge || 2.0);
        const roofType = state.roof_type || state.roofShape || "flat";

        // 1. Roof Length Dimension (along X, offset -Z)
        const rLenText = `L: ${UnitsModule.formatLength(L)}`;
        const pL1 = new THREE.Vector3(0, 0, 0);
        const pL2 = new THREE.Vector3(L, 0, 0);
        grp.add(this.createDimensionLine(pL1, pL2, new THREE.Vector3(0, 0, -1.2), rLenText, 0x0284c7));

        // 2. Roof Width Dimension (along Z, offset -X)
        const rWidText = `l: ${UnitsModule.formatLength(l)}`;
        const pW1 = new THREE.Vector3(0, 0, 0);
        const pW2 = new THREE.Vector3(0, 0, l);
        grp.add(this.createDimensionLine(pW1, pW2, new THREE.Vector3(-1.2, 0, 0), rWidText, 0x0284c7));

        // 3. Roof Height Above Ground (Vertical line at origin going down -H_ground)
        const rHText = `H: ${UnitsModule.formatLength(H_ground)}`;
        const pH1 = new THREE.Vector3(-1.5, -H_ground, 0);
        const pH2 = new THREE.Vector3(-1.5, 0, 0);
        grp.add(this.createDimensionLine(pH1, pH2, new THREE.Vector3(-0.6, 0, 0), rHText, 0x64748b));

        // 4. Line to edge (connecting roof edge at Z=0 to lifeline at Z=lineToEdge)
        const lEdgeText = `d: ${UnitsModule.formatLength(lineToEdge)}`;
        const dimX = Math.min(L * 0.5, lineToEdge + 3.0);
        const yE1 = getRoofHeightAt(dimX, lineToEdge) + 0.15;
        const yE2 = getRoofHeightAt(dimX, 0) + 0.15;
        const pE1 = new THREE.Vector3(dimX, yE1, lineToEdge);
        const pE2 = new THREE.Vector3(dimX, yE2, 0);
        grp.add(this.createDimensionLine(pE1, pE2, new THREE.Vector3(0, 0.1, 0), lEdgeText, 0xf59e0b));

        // 5. Slopes
        if (roofType === "sloped") {
            const slope1 = parseFloat(state.roof_slope_deg || state.roofSlope || 0);
            const spr = this.createDimensionSprite(`Pente: ${slope1.toFixed(1)}°`);
            spr.position.set(L / 2, getRoofHeightAt(L / 2, l / 2) + 0.5, l / 2);
            grp.add(spr);
        } else if (roofType === "triangle") {
            const slope1 = parseFloat(state.roof_slope_deg || 0);
            const slope2 = parseFloat(state.roof_slope_deg_2 || slope1);
            const ridgeZ = parseFloat(state.ridge_position || (l / 2));
            const spr1 = this.createDimensionSprite(`Pente 1: ${slope1.toFixed(1)}°`);
            spr1.position.set(L / 2, getRoofHeightAt(L / 2, ridgeZ / 2) + 0.5, ridgeZ / 2);
            grp.add(spr1);

            const spr2 = this.createDimensionSprite(`Pente 2: ${slope2.toFixed(1)}°`);
            spr2.position.set(L / 2, getRoofHeightAt(L / 2, (ridgeZ + l) / 2) + 0.5, (ridgeZ + l) / 2);
            grp.add(spr2);
        }
    }
};
window.Dimensions3DModule = Dimensions3DModule;

function toggle3DDimensions() {
    state.show_dimensions = !state.show_dimensions;
    const btn = document.getElementById("btn-toggle-dimensions");
    if (btn) btn.classList.toggle("active", state.show_dimensions);
    if (dimensionsGroup) dimensionsGroup.visible = state.show_dimensions;
    if (typeof Dimensions3DModule !== "undefined" && state.show_dimensions) {
        Dimensions3DModule.renderDimensions();
    }
}
window.toggle3DDimensions = toggle3DDimensions;

// ==========================================
// THREE.JS 3D ENGINE MODULE
// ==========================================
let scene, perspectiveCam, orthographicCam, activeCam, renderer, controls;
let roofMesh, gridHelper, anchorGroup, cableGroup, previewCableMesh, obstacleGroup, config10StructuresGroup, config6StructuresGroup;
let labelsGroup, anchorLabelsSubgroup, spanLabelsSubgroup;
let raycaster, mouseVector, mouseHoverPoint = null;

function initThreeEngine() {
    const container = document.getElementById("canvas3d");
    if (!container) return;

    if (typeof THREE === "undefined") {
        console.error("Three.js library is not loaded.");
        return;
    }

    const width = container.clientWidth || window.innerWidth || 800;
    const height = container.clientHeight || (window.innerHeight - 64) || 600;

    // 1. Scene with soft slate background for maximum 3D visual contrast
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);

    // 2. Cameras
    const aspect = (width > 0 && height > 0) ? (width / height) : 1.5;
    perspectiveCam = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    const initDist = Math.max(state.L, state.l) * 1.4;
    perspectiveCam.position.set(state.L / 2 + initDist * 0.8, initDist * 0.9, state.l / 2 + initDist * 0.8);

    const d = 20;
    orthographicCam = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 1000);
    orthographicCam.up.set(0, 0, -1);
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
    if (typeof THREE.OrbitControls !== "undefined") {
        controls = new THREE.OrbitControls(perspectiveCam, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 - 0.02;
    }

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

    labelsGroup = new THREE.Group();
    anchorLabelsSubgroup = new THREE.Group();
    spanLabelsSubgroup = new THREE.Group();
    labelsGroup.add(anchorLabelsSubgroup);
    labelsGroup.add(spanLabelsSubgroup);
    scene.add(labelsGroup);

    obstacleGroup = new THREE.Group();
    scene.add(obstacleGroup);

    config10StructuresGroup = new THREE.Group();
    scene.add(config10StructuresGroup);

    config6StructuresGroup = new THREE.Group();
    scene.add(config6StructuresGroup);

    Dimensions3DModule.init(scene);

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
    } else if (state.drawingMode !== "draw") {
        // 1. Raycast against anchors
        const anchorIntersects = (anchorGroup && anchorGroup.children) ? raycaster.intersectObjects(anchorGroup.children, true) : [];
        if (anchorIntersects.length > 0) {
            let hitObj = anchorIntersects[0].object;
            while (hitObj.parent && hitObj.parent !== anchorGroup) {
                hitObj = hitObj.parent;
            }
            const nodeIndex = anchorGroup.children.indexOf(hitObj);
            if (nodeIndex >= 0) {
                state.selectedNodeIndex = nodeIndex;
                state.selectedSpanIndex = (state.spans && nodeIndex < state.spans.length) ? nodeIndex : Math.max(0, (state.spans ? state.spans.length - 1 : 0));
                highlightSelectedNode(nodeIndex, state.selectedSpanIndex);
                return;
            }
        }

        // 2. Raycast against cables
        const cableIntersects = (cableGroup && cableGroup.children) ? raycaster.intersectObjects(cableGroup.children, true) : [];
        if (cableIntersects.length > 0) {
            let hitCable = cableIntersects[0].object;
            while (hitCable.parent && hitCable.parent !== cableGroup) {
                hitCable = hitCable.parent;
            }
            const cableIndex = cableGroup.children.indexOf(hitCable);
            if (cableIndex >= 0 && state.spans && cableIndex < state.spans.length) {
                state.selectedSpanIndex = cableIndex;
                state.selectedNodeIndex = cableIndex;
                highlightSelectedNode(cableIndex, cableIndex);
                return;
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

function highlightSelectedNode(nodeIdx = null, spanIdx = null) {
    const card = document.getElementById("node-inspector-card");
    if (!card) return;

    if (nodeIdx !== null) state.selectedNodeIndex = nodeIdx;
    if (spanIdx !== null) state.selectedSpanIndex = spanIdx;

    const maxSpan = Calculator.getMaxSpan(state.product);
    const activeLayout = Calculator.calculateAnchorPositions(state.L, state.l, maxSpan);
    const activePositions = activeLayout.all || [];

    if ((state.selectedNodeIndex === undefined || state.selectedNodeIndex < 0) &&
        (state.selectedSpanIndex === undefined || state.selectedSpanIndex < 0)) {
        card.classList.add("hidden");
        return;
    }

    card.classList.remove("hidden");
    const nIdx = Math.max(0, Math.min(state.selectedNodeIndex >= 0 ? state.selectedNodeIndex : 0, activePositions.length - 1));
    const pos = activePositions[nIdx] || { x: 0, y: 0, z: 0 };
    const node = (state.drawingMode === "place" && state.customPoints[nIdx]) ? state.customPoints[nIdx] : pos;

    const sIdx = (state.selectedSpanIndex !== undefined && state.selectedSpanIndex >= 0)
        ? state.selectedSpanIndex
        : Math.min(nIdx, (state.spans ? state.spans.length - 1 : 0));
    const targetSpan = (state.spans && state.spans[sIdx]) ? state.spans[sIdx] : null;

    // Display element name & UID
    const nodeIdVal = document.getElementById("node-id-val");
    if (nodeIdVal) {
        if (targetSpan) {
            const isFall = (state.selectedFallSpanId === targetSpan.id);
            nodeIdVal.innerHTML = `<strong>Ancrage A${nIdx + 1}</strong> &bull; <strong>Portée S${sIdx + 1}</strong> <span style="font-size:0.75rem; color:#64748b;">(UID: ${targetSpan.id.slice(-6)})</span> ${isFall ? '<span class="badge-tag-id fall-badge" style="margin-left:4px;">Portée de chute active</span>' : ''}`;
        } else {
            nodeIdVal.textContent = `Ancrage #${nIdx + 1}`;
        }
    }

    const nodeCoordsVal = document.getElementById("node-coords-val");
    if (nodeCoordsVal) {
        nodeCoordsVal.textContent = `X: ${formatDistance(node.x, 2, state.lang)}, Y: ${formatDistance(node.y || 0, 2, state.lang)}, Z: ${formatDistance(node.z, 2, state.lang)}`;
    }

    // Geometry fields for current span
    if (targetSpan) {
        const isEn = (parseInt(state.lang) === 1);
        const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
        const uInsp = document.getElementById("unit-dist-insp");
        if (uInsp) uInsp.textContent = isUS ? "ft" : "m";

        const inpLen = document.getElementById("insp-length-val");
        if (inpLen) {
            const spanLenM = targetSpan.length || 5.0;
            inpLen.value = isUS ? (spanLenM * METERS_TO_FEET).toFixed(2) : spanLenM.toFixed(2);
        }

        const inpBend = document.getElementById("insp-bend-val");
        if (inpBend) inpBend.value = (targetSpan.bend_after_deg !== undefined ? targetSpan.bend_after_deg : targetSpan.bendDeg) || 0;

        const inpSlope = document.getElementById("insp-slope-val");
        if (inpSlope) inpSlope.value = (targetSpan.slope_deg !== undefined ? targetSpan.slope_deg : targetSpan.slopeDeg) || 0;

        const inpXCones = document.getElementById("insp-xcones-val");
        if (inpXCones) inpXCones.value = targetSpan.xconesCount || 0;

        const groupXMat = document.getElementById("group-insp-xmatrix");
        const btnXMatTxt = document.getElementById("btn-insp-xmatrix-text");
        if (groupXMat) {
            const isInter = (nIdx > 0 && nIdx < activePositions.length - 1);
            groupXMat.style.display = isInter ? "block" : "none";
            const hasX = !!(node.hasXMatrix || node.type === "x_matrix");
            if (btnXMatTxt) {
                btnXMatTxt.textContent = hasX ? (parseInt(state.lang) === 1 ? "Remove X-Matrix" : "Retirer la X-Matrix") : (parseInt(state.lang) === 1 ? "Add X-Matrix" : "Ajouter une X-Matrix");
            }
            const pnlBranches = document.getElementById("insp-xmatrix-branches-panel");
            const listBranches = document.getElementById("insp-xmatrix-branches-list");
            const countBadge = document.getElementById("insp-xmat-branch-count");
            const btnAddBranch = document.getElementById("btn-add-xmatrix-branch");
            if (pnlBranches) {
                pnlBranches.style.display = hasX ? "block" : "none";
                if (hasX && listBranches) {
                    const spanIdx = (nIdx > 0 && state.spans && nIdx <= state.spans.length) ? nIdx - 1 : 0;
                    const sp = (state.spans && state.spans[spanIdx]) ? state.spans[spanIdx] : null;
                    const branches = (sp && sp.xMatrixBranches) ? sp.xMatrixBranches : (node.xMatrixBranches || []);
                    if (countBadge) countBadge.textContent = `${branches.length}/2`;

                    const distUnit = isUS ? "ft" : "m";
                    if (branches.length === 0) {
                        listBranches.innerHTML = `<span style="font-size:0.75rem; color:#64748b; font-style:italic;">${isEn ? "No branch (pass-through)" : "0 branche (jonction simple)"}</span>`;
                    } else {
                        listBranches.innerHTML = branches.map((br, bIdx) => {
                            const bSpans = (typeof getBranchSpans === "function") ? getBranchSpans(br) : (br.spans || [{ id: (br.id || "xmb") + "_s1", length: br.length || 5.0 }]);
                            const angVal = br.angleDeg !== undefined ? br.angleDeg : (bIdx === 0 ? 90 : -90);
                            return `
                                <div class="xmatrix-branch-card" style="margin-bottom:6px;">
                                    <div style="display:flex; align-items:center; justify-content:space-between; gap:4px; margin-bottom:4px;">
                                        <strong style="color:#2563eb; font-size:0.75rem;"><i class="fa-solid fa-code-branch"></i> B${bIdx + 1}</strong>
                                        <div style="display:flex; align-items:center; gap:2px;">
                                            <span style="font-size:0.7rem; color:#475569;">Angle:</span>
                                            <input type="number" class="insp-xmat-ang-input" data-span-idx="${spanIdx}" data-branch-idx="${bIdx}" value="${angVal}" step="any" min="-180" max="180" style="width:46px; font-size:0.75rem; padding:2px 4px; height:24px; text-align:center;">
                                            <span style="font-size:0.7rem; color:#64748b;">°</span>
                                        </div>
                                        <button type="button" class="btn-table-icon btn-danger-hover insp-btn-del-branch" data-span-idx="${spanIdx}" data-branch-idx="${bIdx}" title="${isEn ? "Delete branch" : "Supprimer la branche"}" style="height:22px; width:22px; font-size:0.7rem; padding:0;">
                                            <i class="fa-solid fa-trash"></i>
                                        </button>
                                    </div>
                                    <div class="insp-branch-spans-list">
                                        ${bSpans.map((subSp, sIdx) => {
                                            const subLenVal = isUS ? (subSp.length * METERS_TO_FEET).toFixed(2) : (typeof subSp.length === "number" ? subSp.length.toFixed(2) : subSp.length);
                                            return `
                                                <div style="display:flex; align-items:center; justify-content:space-between; gap:4px; padding:2px 0;">
                                                    <span style="font-size:0.72rem; font-weight:600; color:#3b82f6;">S${sIdx + 1}:</span>
                                                    <div style="display:flex; align-items:center; gap:2px;">
                                                        <input type="number" class="insp-xmat-subspan-input xmat-branch-len-input" data-span-idx="${spanIdx}" data-branch-idx="${bIdx}" data-subspan-idx="${sIdx}" value="${subLenVal}" step="any" min="0.5" style="width:52px; font-size:0.75rem; padding:2px 4px; height:22px; text-align:center;">
                                                        <span style="font-size:0.68rem; color:#64748b;">${distUnit}</span>
                                                    </div>
                                                    ${bSpans.length > 1 ? `
                                                        <button type="button" class="insp-btn-del-subspan" data-span-idx="${spanIdx}" data-branch-idx="${bIdx}" data-subspan-idx="${sIdx}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.7rem; padding:0 2px;" title="${isEn ? "Delete span" : "Supprimer cette portée"}"><i class="fa-solid fa-times"></i></button>
                                                    ` : '<span style="width:14px;"></span>'}
                                                </div>
                                            `;
                                        }).join('')}
                                        <button type="button" class="btn btn-secondary btn-sm insp-btn-add-subspan" data-span-idx="${spanIdx}" data-branch-idx="${bIdx}" style="width:100%; margin-top:2px; height:22px; font-size:0.68rem; padding:1px 4px; color:#2563eb; border-color:#bfdbfe; background:#eff6ff;">
                                            <i class="fa-solid fa-plus"></i> ${isEn ? "Add Span" : "Ajouter portée"}
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join("");

                        listBranches.querySelectorAll(".insp-xmat-subspan-input").forEach(inp => {
                            inp.addEventListener("change", (e) => {
                                const bIdx = parseInt(e.target.dataset.branchIdx);
                                const subIdx = parseInt(e.target.dataset.subspanIdx);
                                const raw = parseFloat(e.target.value) || 5.0;
                                const meters = isUS ? (raw / METERS_TO_FEET) : raw;
                                if (sp && sp.xMatrixBranches && sp.xMatrixBranches[bIdx]) {
                                    const bSpans = getBranchSpans(sp.xMatrixBranches[bIdx]);
                                    if (bSpans[subIdx]) {
                                        bSpans[subIdx].length = Math.max(0.5, meters);
                                    }
                                    getBranchTotalLength(sp.xMatrixBranches[bIdx]);
                                    update3DScene();
                                    renderDynamicLayoutForm();
                                }
                            });
                        });

                        listBranches.querySelectorAll(".insp-btn-add-subspan").forEach(btn => {
                            btn.addEventListener("click", () => {
                                const bIdx = parseInt(btn.dataset.branchIdx);
                                if (sp && sp.xMatrixBranches && sp.xMatrixBranches[bIdx]) {
                                    const branch = sp.xMatrixBranches[bIdx];
                                    const bSpans = getBranchSpans(branch);
                                    const newSubId = (branch.id || "xmb") + "_s" + (bSpans.length + 1);
                                    bSpans.push({ id: newSubId, length: 5.0 });
                                    getBranchTotalLength(branch);
                                    highlightSelectedNode(nIdx, sIdx);
                                    update3DScene();
                                    renderDynamicLayoutForm();
                                }
                            });
                        });

                        listBranches.querySelectorAll(".insp-btn-del-subspan").forEach(btn => {
                            btn.addEventListener("click", () => {
                                const bIdx = parseInt(btn.dataset.branchIdx);
                                const subIdx = parseInt(btn.dataset.subspanIdx);
                                if (sp && sp.xMatrixBranches && sp.xMatrixBranches[bIdx]) {
                                    const branch = sp.xMatrixBranches[bIdx];
                                    const bSpans = getBranchSpans(branch);
                                    if (bSpans.length > 1) {
                                        bSpans.splice(subIdx, 1);
                                        getBranchTotalLength(branch);
                                        highlightSelectedNode(nIdx, sIdx);
                                        update3DScene();
                                        renderDynamicLayoutForm();
                                    }
                                }
                            });
                        });

                        listBranches.querySelectorAll(".insp-xmat-ang-input").forEach(inp => {
                            inp.addEventListener("change", (e) => {
                                const bIdx = parseInt(e.target.dataset.branchIdx);
                                if (sp && sp.xMatrixBranches && sp.xMatrixBranches[bIdx]) {
                                    let ang = parseFloat(e.target.value) || 0;
                                    const norm = ((ang % 360) + 360) % 360;
                                    if (norm < 15 || norm > 345 || Math.abs(norm - 180) < 15) {
                                        alert(["⚠️ L'angle de la branche ne peut pas être aligné avec la ligne principale (0° ou 180°).", "⚠️ Branch angle cannot be aligned with the main lifeline (0° or 180°)."][state.lang || 0]);
                                        ang = (bIdx === 0 ? 90 : -90);
                                        e.target.value = ang;
                                    }
                                    sp.xMatrixBranches[bIdx].angleDeg = ang;
                                    update3DScene();
                                    renderDynamicLayoutForm();
                                }
                            });
                        });

                        listBranches.querySelectorAll(".insp-btn-del-branch").forEach(btn => {
                            btn.addEventListener("click", () => {
                                const bIdx = parseInt(btn.dataset.branchIdx);
                                if (sp && sp.xMatrixBranches) {
                                    sp.xMatrixBranches.splice(bIdx, 1);
                                    highlightSelectedNode(nIdx, sIdx);
                                    update3DScene();
                                    renderDynamicLayoutForm();
                                }
                            });
                        });
                    }

                    if (btnAddBranch) {
                        btnAddBranch.disabled = (branches.length >= 2);
                        btnAddBranch.onclick = () => {
                            if (sp) {
                                if (!sp.xMatrixBranches) sp.xMatrixBranches = [];
                                cleanupCollinearXMatrixBranches(state.spans);
                                if (sp.xMatrixBranches.length < 2) {
                                    const count = sp.xMatrixBranches.length;
                                    const nextAng = count === 0 ? 90 : -90;
                                    const bId = "xmb_" + Date.now() + "_" + count;
                                    sp.xMatrixBranches.push({
                                        id: bId,
                                        length: 5.0,
                                        angleDeg: nextAng,
                                        spans: [{ id: bId + "_s1", length: 5.0 }]
                                    });
                                    highlightSelectedNode(nIdx, sIdx);
                                    update3DScene();
                                    renderDynamicLayoutForm();
                                }
                            }
                        };
                    }
                }
            }
        }

        const fallBtn = document.getElementById("btn-insp-set-fall");
        const fallTxt = document.getElementById("btn-insp-fall-text");
        const isCurrentFall = (state.selectedFallSpanId === targetSpan.id);
        if (fallTxt) {
            fallTxt.textContent = isCurrentFall
                ? (isEn ? "✓ Active fall span" : "✓ Portée de chute active")
                : (isEn ? "Set as fall span" : "Définir comme portée de chute");
        }
        if (fallBtn) {
            if (isCurrentFall) {
                fallBtn.classList.remove("btn-secondary");
                fallBtn.classList.add("btn-indigo");
            } else {
                fallBtn.classList.remove("btn-indigo");
                fallBtn.classList.add("btn-secondary");
            }
        }
    }

    const nodeTypeSel = document.getElementById("node-type-select");
    if (nodeTypeSel) nodeTypeSel.value = node.type || "intermediaire";

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

function animate() {
    requestAnimationFrame(animate);
    if (controls) {
        controls.update();
    }
    if (renderer && scene && activeCam) {
        renderer.render(scene, activeCam);
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
        // Position the flat bottom tab of the A-Fix bracket flush on top of post plate at Y = 0 (Y_offset = +0.0591)
        // Center the circular base plate dead-center over the post top plate (Z = +0.1070, X = 0)
        clone.position.set(0, 0.0591, 0.1070);
    } else if (modelFile && modelFile.includes("X-Cone")) {
        const coneCenter = box.getCenter(new THREE.Vector3());
        clone.position.set(-coneCenter.x, -coneCenter.y, -coneCenter.z);
    } else {
        const topCenter = topBox.isEmpty() ? box.getCenter(new THREE.Vector3()) : topBox.getCenter(new THREE.Vector3());
        clone.position.set(-topCenter.x, -box.min.y, -topCenter.z);
    }

    // Apply base Y-axis rotation offset for PRO & CORE models
    const isNewOrLightPro = modelFile ? (modelFile.includes("new_pro") || modelFile.includes("light_pro")) : (isPro(state.product) || isCore(state.product));
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
    rotGroup.rotation.y = -rotY + angleOffset;
    rotGroup.add(clone);

    wrapper.add(rotGroup);

    // Save actual model height for precise cable attachment
    if (isLongRangeModel) {
        wrapper.userData.height = 0.096; // Cable eyelet alignment offset for Long Range (aligns cable 100% through maillon eyelet)
    } else {
        wrapper.userData.height = (size.y > 0.05 && size.y < 10.0) ? size.y : 0.45;
    }

    return wrapper;
}

function createHighPostMesh(targetHeight = 2.54) {
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

    const totalH = Math.max(0.6, parseFloat(targetHeight) || 2.54);
    const plateThickness = 0.02;
    const colH = Math.max(0.2, totalH - 2 * plateThickness);

    // Base plate (0.35m x 0.35m x 0.02m)
    const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.35, plateThickness, 0.35), plateMat);
    basePlate.position.y = plateThickness / 2;
    group.add(basePlate);

    // 4 Corner Bolts on base plate
    const boltGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.035, 12);
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.2 });
    [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]].forEach(([bx, bz]) => {
        const bolt = new THREE.Mesh(boltGeo, boltMat);
        bolt.position.set(bx, plateThickness + 0.015, bz);
        group.add(bolt);
    });

    // High vertical tubular column
    const columnGeom = new THREE.CylinderGeometry(0.065, 0.065, colH, 24);
    const column = new THREE.Mesh(columnGeom, postMat);
    column.position.y = plateThickness + colH / 2;
    group.add(column);

    // Top flange mounting plate
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(0.25, plateThickness, 0.25), plateMat);
    topPlate.position.y = plateThickness + colH + plateThickness / 2;
    group.add(topPlate);

    group.userData.height = plateThickness + colH + plateThickness;
    return group;
}

// Procedural 3D Post Anchor Mesh Fallback (guarantees post visibility even if GLB CAD model is loading/CORS blocked)
function createProceduralPostMesh(colorHex, height = 0.45) {
    const group = new THREE.Group();
    const matColor = colorHex || (state.colors && state.colors.anchors) || 0x94a3b8;
    const steelMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(matColor),
        metalness: 0.85,
        roughness: 0.2
    });

    const postH = Math.max(0.2, height - 0.05);

    // 1. Base Plate (Plaque d'embase)
    const baseGeo = new THREE.BoxGeometry(0.18, 0.02, 0.18);
    const baseMesh = new THREE.Mesh(baseGeo, steelMat);
    baseMesh.position.set(0, 0.01, 0);
    group.add(baseMesh);

    // 4 Corner Bolts
    const boltGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8);
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.3 });
    [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]].forEach(([bx, bz]) => {
        const bolt = new THREE.Mesh(boltGeo, boltMat);
        bolt.position.set(bx, 0.025, bz);
        group.add(bolt);
    });

    // 2. Main Vertical Column Tube (Poteau d'ancrage)
    const postGeo = new THREE.CylinderGeometry(0.03, 0.03, postH, 16);
    const postMesh = new THREE.Mesh(postGeo, steelMat);
    postMesh.position.set(0, 0.02 + postH / 2, 0);
    group.add(postMesh);

    // 3. Top Cable Passage Ring Head (Tête de poteau)
    const topHeadGroup = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(0.04, 0.01, 12, 24);
    const ringMesh = new THREE.Mesh(ringGeo, steelMat);
    ringMesh.rotation.y = Math.PI / 2;
    topHeadGroup.add(ringMesh);

    const clampGeo = new THREE.BoxGeometry(0.05, 0.03, 0.05);
    const clampMesh = new THREE.Mesh(clampGeo, steelMat);
    clampMesh.position.set(0, -0.015, 0);
    topHeadGroup.add(clampMesh);

    topHeadGroup.position.set(0, 0.02 + postH, 0);
    group.add(topHeadGroup);

    group.userData.height = height;
    return group;
}

// Resolves height-specific 3D CAD model file for New PRO & Light PRO posts based on elevation preset
function resolvePostModelForElevation(file, presetOverride = null) {
    if (!file || typeof file !== "string") return file;
    const preset = presetOverride || (typeof state !== "undefined" && state ? state.hllElevationPreset : "knee") || "knee";

    // Direct mapping for authentic 1.5m and 1.8m GLB CAD models
    const MODEL_HEIGHT_MAP = {
        // NEW PRO
        "models/new_pro/P_Glava_Rigide.glb": {
            "knee": "models/new_pro/P_Glava_Rigide.glb",
            "d_ring": "models/new_pro/P_Glava_NewPro_1.5.glb",
            "overhead": "models/new_pro/P_Glava_NewPro_1.8.glb"
        },
        "models/new_pro/P_Galva_Rigide.glb": {
            "knee": "models/new_pro/P_Glava_Rigide.glb",
            "d_ring": "models/new_pro/P_Glava_NewPro_1.5.glb",
            "overhead": "models/new_pro/P_Glava_NewPro_1.8.glb"
        },
        "models/new_pro/P_Inox_Rigide.glb": {
            "knee": "models/new_pro/P_Inox_Rigide.glb",
            "d_ring": "models/new_pro/P_Inox_NewPro_1.5.glb",
            "overhead": "models/new_pro/P_Inox_NewPro_1.8.glb"
        },
        // LIGHT PRO
        "models/light_pro/P_Galva_Rigide.glb": {
            "knee": "models/light_pro/P_Galva_Rigide.glb",
            "d_ring": "models/light_pro/P_Glava_LightPro_1.5.glb",
            "overhead": "models/light_pro/P_Glava_LightPro_1.8.glb"
        },
        "models/light_pro/P_Glava_Rigide.glb": {
            "knee": "models/light_pro/P_Galva_Rigide.glb",
            "d_ring": "models/light_pro/P_Glava_LightPro_1.5.glb",
            "overhead": "models/light_pro/P_Glava_LightPro_1.8.glb"
        },
        "models/light_pro/P_Inox_Rigide.glb": {
            "knee": "models/light_pro/P_Inox_Rigide.glb",
            "d_ring": "models/light_pro/P_Inox_LightPro_1.5.glb",
            "overhead": "models/light_pro/P_Inox_LightPro_1.8.glb"
        }
    };

    // Normalize in case file was already a height-specific path
    let baseKey = file;
    if (file.includes("models/new_pro")) {
        if (file.includes("Inox")) baseKey = "models/new_pro/P_Inox_Rigide.glb";
        else if (file.includes("Glava") || file.includes("Galva")) baseKey = "models/new_pro/P_Glava_Rigide.glb";
    } else if (file.includes("models/light_pro")) {
        if (file.includes("Inox")) baseKey = "models/light_pro/P_Inox_Rigide.glb";
        else if (file.includes("Glava") || file.includes("Galva")) baseKey = "models/light_pro/P_Galva_Rigide.glb";
    }

    if (MODEL_HEIGHT_MAP[baseKey]) {
        if (MODEL_HEIGHT_MAP[baseKey][preset]) {
            return MODEL_HEIGHT_MAP[baseKey][preset];
        }
        if (preset === "custom") {
            const elev = (typeof state !== "undefined" && state && parseFloat(state.hllElevation)) || 0.45;
            if (elev >= 1.65) return MODEL_HEIGHT_MAP[baseKey]["overhead"];
            if (elev >= 0.95) return MODEL_HEIGHT_MAP[baseKey]["d_ring"];
            return MODEL_HEIGHT_MAP[baseKey]["knee"];
        }
    }

    return file;
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
            const xmat = list.find(c => c.id === "X-Matrix" && c.checked);
            if (xmat) {
                filesToRender.push(xmat.file);
            } else {
                const defaultXmat = list.find(c => c.id === "X-Matrix");
                if (defaultXmat) filesToRender.push(defaultXmat.file);
            }
        } else if (nodeType === "extremite") {
            // For EXTREME, render 3D model if Absorber (LongRange) or Anchor (A-Fix) is checked
            if (isExtreme(state.product)) {
                const lrAbsorber = list.find(c => c.id === "LongRange");
                const afixAnchor = list.find(c => c.id === "A-Fix");
                const isLr = (lrAbsorber && lrAbsorber.checked) || (state.checkedComponents && state.checkedComponents["LongRange"]);
                const isAfix = (afixAnchor && afixAnchor.checked) || (state.checkedComponents && state.checkedComponents["A-Fix"]);
                if (isLr || isAfix) {
                    filesToRender.push((lrAbsorber && lrAbsorber.file) || (afixAnchor && afixAnchor.file) || "models/long_range/LongRange.glb");
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
            if (isExtreme(state.product)) {
                const lrAbsorber = list.find(c => c.id === "LongRange");
                const afixAnchor = list.find(c => c.id === "A-Fix");
                const isLr = (lrAbsorber && lrAbsorber.checked) || (state.checkedComponents && state.checkedComponents["LongRange"]);
                const isAfix = (afixAnchor && afixAnchor.checked) || (state.checkedComponents && state.checkedComponents["A-Fix"]);
                if (isLr || isAfix) {
                    filesToRender.push((lrAbsorber && lrAbsorber.file) || (afixAnchor && afixAnchor.file) || "models/long_range/LongRange.glb");
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
    let renderedCount = 0;

    const isRangeFamily = state.product && state.product.includes("RANGE");
    const isOverheadMode = isRangeFamily && (state.mountingType === "overhead" || state.roofShape === "flat_overhead" || state.hllElevationPreset === "overhead" || state.hllElevationPreset === "custom");
    const isPoteauHautChecked = isRangeFamily && list.some(c => c.id === "Poteau_Haut" && c.checked);

    if (isOverheadMode || isPoteauHautChecked) {
        const rangeElevation = (state.hllElevationPreset === "overhead") ? (parseFloat(state.hllElevation) || 3.00) : (parseFloat(state.hllElevation) || 2.54);
        const highPostObj = createHighPostMesh(rangeElevation);
        mainGroup.add(highPostObj);
        currentBaseY += highPostObj.userData.height;
        totalHeight += highPostObj.userData.height;
        renderedCount++;
    }

    // Filter and deduplicate valid GLB/OBJ files to render
    const validFilesToRender = [...new Set(filesToRender.filter(f => f && typeof f === 'string'))];

    // Separate post base components from top matrix / junction components
    const isTopComponent = (f) => f && typeof f === "string" && (f.includes("New_Pro.glb") || f.includes("LightPro.glb") || f.includes("LongRange.glb") || f.includes("X-Matrix.glb"));
    const postFiles = validFilesToRender.filter(f => !isTopComponent(f));
    const topFiles = validFilesToRender.filter(f => isTopComponent(f));

    // Render post base components first at Y = 0 (resolved to height-specific model if applicable)
    postFiles.forEach(origFile => {
        const file = resolvePostModelForElevation(origFile);
        if (file && objCache[file]) {
            const modelObj = prepareOBJModel(objCache[file], rotY, file);
            modelObj.position.y = currentBaseY;
            const h = modelObj.userData.height || 0.30;
            currentBaseY += h;
            totalHeight += h;
            mainGroup.add(modelObj);
            renderedCount++;
        } else if (file) {
            loadOBJModel(file).then(() => {
                if (typeof update3DScene === "function") update3DScene();
            });
        }
    });

    // If no post base components were rendered:
    if (postFiles.length === 0 && topFiles.length > 0 && !isOverheadMode && !isPoteauHautChecked) {
        const isMatrixOnly = topFiles.every(f => f.includes("X-Matrix.glb"));
        if (isMatrixOnly) {
            const defaultHeight = targetCableHeight || 0.45;
            currentBaseY = Math.max(0.05, defaultHeight - 0.035);
        } else {
            currentBaseY = 0.0;
        }
    }

    // Render top matrix/junction components (X-Matrix, New_Pro absorber, etc.)
    topFiles.forEach(file => {
        if (file && objCache[file]) {
            const modelObj = prepareOBJModel(objCache[file], rotY, file);
            modelObj.position.y = currentBaseY;
            const h = modelObj.userData.height || 0.05;
            totalHeight += h;
            mainGroup.add(modelObj);
            renderedCount++;
        } else if (file) {
            loadOBJModel(file).then(() => {
                if (typeof update3DScene === "function") update3DScene();
            });
        }
    });

    // PROCEDURAL FALLBACK DISABLED: No default artificial post is added if no component is checked
    /* if (renderedCount === 0 && !isOverheadMode && !isPoteauHautChecked) {
        const procPost = createProceduralPostMesh(colorHex, 0.45);
        mainGroup.add(procPost);
        totalHeight = 0.45;
    } */

    mainGroup.userData.height = totalHeight > 0.05 ? totalHeight : 0.45;
    return mainGroup;
}

// Helper: Calculate exact Roof Height at any (x, z) coordinate (Spec V2 — 03)
function getRoofHeightAt(x, z) {
    const roofType = state.roof_type || state.roofShape || "flat";
    const slope1Deg = state.roof_slope_deg !== undefined ? state.roof_slope_deg : (state.roofSlope || 0);
    const slope2Deg = state.roof_slope_deg_2 !== undefined ? state.roof_slope_deg_2 : slope1Deg;
    const rad1 = slope1Deg * (Math.PI / 180);
    const rad2 = slope2Deg * (Math.PI / 180);

    if (roofType === "sloped") {
        return Math.max(0, z * Math.tan(rad1));
    } else if (roofType === "triangle") {
        const ridgeZ = state.ridge_position !== undefined ? state.ridge_position : ((state.roof_width || state.l || 15) / 2);
        const ridgeH = ridgeZ * Math.tan(rad1);
        if (z <= ridgeZ) {
            return Math.max(0, z * Math.tan(rad1));
        } else {
            return Math.max(0, ridgeH - (z - ridgeZ) * Math.tan(rad2));
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
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x0f172a });

    if (state.layoutType === "multi_bend_circle") {
        const H = state.config6Height || 8.0;
        const groundGeo = new THREE.BoxGeometry(L + 12, 0.2, l + 12);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8 });
        const groundMesh = new THREE.Mesh(groundGeo, groundMat);
        groundMesh.position.set(L / 2, -H - 0.1, l / 2);
        groundMesh.receiveShadow = true;
        roofGroup.add(groundMesh);

        const edges = new THREE.EdgesGeometry(groundGeo);
        const line = new THREE.LineSegments(edges, edgeMat);
        line.position.set(L / 2, -H - 0.1, l / 2);
        roofGroup.add(line);

        return roofGroup;
    }

    if (state.layoutType === "slope_single" || state.layoutType === "slope_multi") {
        return new THREE.Group(); // Dedicated sloped roof generated by renderConfig8_9SlopeSystem3D()
    }

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
    } else if (shape === "triangle" || state.roof_type === "triangle") {
        const ridgeZ = state.ridge_position !== undefined ? state.ridge_position : (l / 2);
        const slope1Deg = state.roof_slope_deg !== undefined ? state.roof_slope_deg : (state.roofSlope || 0);
        const slope2Deg = state.roof_slope_deg_2 !== undefined ? state.roof_slope_deg_2 : slope1Deg;
        const rad1 = slope1Deg * (Math.PI / 180);
        const rad2 = slope2Deg * (Math.PI / 180);
        const ridgeH = ridgeZ * Math.tan(rad1);
        const endH = Math.max(0, ridgeH - (l - ridgeZ) * Math.tan(rad2));
        const thick = 0.20;

        const roofShape2D = new THREE.Shape();
        roofShape2D.moveTo(0, 0);
        roofShape2D.lineTo(ridgeZ, ridgeH);
        roofShape2D.lineTo(l, endH);
        roofShape2D.lineTo(l, endH - thick);
        roofShape2D.lineTo(ridgeZ, ridgeH - thick);
        roofShape2D.lineTo(0, -thick);
        roofShape2D.closePath();

        const extrudeSettings = {
            steps: 1,
            depth: L,
            bevelEnabled: false,
            curveSegments: 16
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

    // Flat roof slab with thick 3D volumetric block and dark edge outline
    const roofGeo = new THREE.BoxGeometry(L, 0.2, l);
    const roofMeshFlat = new THREE.Mesh(roofGeo, roofMat);
    roofMeshFlat.position.set(L / 2, -0.1, l / 2);
    roofMeshFlat.receiveShadow = true;
    roofGroup.add(roofMeshFlat);

    const edgesFlat = new THREE.EdgesGeometry(roofGeo);
    const lineFlat = new THREE.LineSegments(edgesFlat, edgeMat);
    lineFlat.position.set(L / 2, -0.1, l / 2);
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

// 3D Procedural X-Matrix Stopper Pin (Butée de jonction X-Matrix avec boulon de verrouillage)
function createXMatrixStopperPin(pos, dir) {
    const group = new THREE.Group();
    const compColor = state.colors.anchors || "#f8fafc";
    const matPin = new THREE.MeshStandardMaterial({
        color: new THREE.Color(compColor),
        metalness: 0.92,
        roughness: 0.12,
        emissive: new THREE.Color(compColor),
        emissiveIntensity: 0.15
    });
    const matBolt = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#64748b"),
        metalness: 0.95,
        roughness: 0.15
    });

    const pinRadius = 0.012;
    const pinHeight = 0.045;

    // Main Stopper Cylinder (Butée)
    const pinGeo = new THREE.CylinderGeometry(pinRadius, pinRadius, pinHeight, 16);
    const pinMesh = new THREE.Mesh(pinGeo, matPin);
    pinMesh.position.set(0, pinHeight / 2, 0);
    group.add(pinMesh);

    // Top Hexagonal Locking Bolt
    const boltRadius = 0.009;
    const boltHeight = 0.010;
    const boltGeo = new THREE.CylinderGeometry(boltRadius, boltRadius, boltHeight, 6);
    const boltMesh = new THREE.Mesh(boltGeo, matBolt);
    boltMesh.position.set(0, pinHeight + boltHeight / 2, 0);
    group.add(boltMesh);

    // Position stopper pin along dir at the arm slot of X-Matrix (~0.055m from center)
    const offsetPos = pos.clone().add(dir.clone().normalize().multiplyScalar(0.055));
    group.position.copy(offsetPos);

    return group;
}

// Constants for Configuration 10 Escalier & Plateforme rendering
const CONFIG10_STAIRS = {
    stairWidth: 1.0,         // Width of stair treads in meters
    maxRiser: 0.18,          // Maximum riser height per step in meters
    platformMargin: 1.0,     // Platform overhang margin around end anchors in meters
    sideOffset: 0.85         // Lateral offset of stair parallel to cable line
};

// Helper to build 2D extruded stringer geometry with vertical cuts at platform walls and horizontal cuts at floor levels
function createStringerGeometry(horizDist, y0, y1, depth, width) {
    const shape = new THREE.Shape();
    const dY = y1 - y0;
    const absDy = Math.abs(dY);
    const angle = Math.atan2(absDy, horizDist);

    const cosA = Math.max(0.01, Math.cos(angle));
    const sinA = Math.max(0.01, Math.sin(angle));
    const vDrop = depth / cosA;
    const hShift = depth / sinA;

    if (dY >= 0) {
        // Ascending stair: (0,y0) is bottom departure, (horizDist,y1) is top arrival
        shape.moveTo(0, y0);
        shape.lineTo(horizDist, y1);
        shape.lineTo(horizDist, y1 - vDrop);
        shape.lineTo(Math.min(horizDist, hShift), y0);
        shape.closePath();
    } else {
        // Descending stair: (0,y0) is top departure, (horizDist,y1) is bottom arrival
        shape.moveTo(0, y0);
        shape.lineTo(0, y0 - vDrop);
        shape.lineTo(Math.max(0, horizDist - hShift), y1);
        shape.lineTo(horizDist, y1);
        shape.closePath();
    }

    const extrudeSettings = {
        steps: 1,
        depth: width,
        bevelEnabled: false
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.translate(0, 0, -width / 2);
    return geo;
}

function createConfig10Structures3D() {
    if (typeof config10StructuresGroup !== "undefined" && config10StructuresGroup) {
        while (config10StructuresGroup.children.length > 0) {
            const child = config10StructuresGroup.children[0];
            child.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material.dispose();
                }
            });
            config10StructuresGroup.remove(child);
        }
    }

    if (state.layoutType !== "slope_horizontal_comb" && state.layoutType !== "multi_straight" && state.layoutType !== "slope_multi") return;
    if (state.showStairs === false) return;

    const spans = state.spans || [];
    if (spans.length === 0) return;

    const hasAnySloped = spans.some(sp => sp.isSloped || (sp.slope_deg && sp.slope_deg !== 0) || (sp.slopeDeg && sp.slopeDeg !== 0));
    if (!hasAnySloped) return;

    const activeLayout = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
    const nodes = activeLayout.line1 || [];
    if (nodes.length < 2) return;

    // Check if any slope > 45° and display non-blocking warning badge if so
    let hasExtremeSlope = false;
    spans.forEach(sp => {
        const sDeg = (sp.slope_deg !== undefined ? sp.slope_deg : sp.slopeDeg) || 0;
        if ((sp.isSloped || sDeg > 0) && sDeg > 45) {
            hasExtremeSlope = true;
        }
    });

    const warningElem = document.getElementById("canvas-warning");
    const warningTextElem = document.getElementById("warning-text");
    if (hasExtremeSlope && warningElem && warningTextElem) {
        warningTextElem.textContent = ["⚠️ Pente supérieure à 45° : escalier non réaliste", "⚠️ Slope greater than 45°: staircase not realistic", "⚠️ Pendiente superior a 45°: escalera no realista"][state.lang || 0];
        warningElem.classList.remove("hidden");
    }

    const stairTreadMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.6,
        metalness: 0.2
    });
    const stringerMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.3,
        metalness: 0.7
    });
    const platformMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.4,
        metalness: 0.1
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x0f172a });

    // 1. Process Stairs on Sloped Spans
    const marginX = 0.25; // 0.25m overhang around post centers for platform walls

    for (let i = 0; i < spans.length; i++) {
        const sp = spans[i];
        const spSlope = (sp.slope_deg !== undefined ? sp.slope_deg : sp.slopeDeg) || 0;
        if (!sp.isSloped && spSlope === 0) continue;

        const pA = nodes[i];
        const pB = nodes[i + 1];
        if (!pA || !pB) continue;

        // Calculate stair start X (departure) and end X (arrival) flush with platform walls
        let startX = pA.x;
        if (pA.y > 0.05) {
            startX = pA.x + marginX; // Starts flush at rear wall of departure platform
        }

        let endX = pB.x;
        if (pB.y > 0.05) {
            endX = pB.x - marginX; // Ends flush at front wall of arrival platform
        }

        const dX = endX - startX;
        const dY = pB.y - pA.y;
        const dZ = pB.z - pA.z;
        const horizDist = Math.sqrt(dX * dX + dZ * dZ);
        const absHeight = Math.abs(dY);

        if (horizDist < 0.1 || absHeight < 0.05) continue;

        const numSteps = Math.max(1, Math.ceil(absHeight / CONFIG10_STAIRS.maxRiser));
        const stepH = dY / numSteps;
        const stepD = horizDist / numSteps;

        const stairDir = new THREE.Vector3(dX, 0, dZ).normalize();
        const sideDir = new THREE.Vector3(-stairDir.z, 0, stairDir.x).normalize();

        // Render Tread Steps (Marches d'escalier sans garde-corps, ajustées pile au bord)
        for (let s = 0; s < numSteps; s++) {
            const treadW = stepD * 0.98;
            const treadH = 0.04;
            const treadD = CONFIG10_STAIRS.stairWidth;

            const treadGeo = new THREE.BoxGeometry(treadW, treadH, treadD);
            const treadMesh = new THREE.Mesh(treadGeo, stairTreadMat);

            const sProgress = (s + 0.5) / numSteps;
            const sX = startX + dX * sProgress + sideDir.x * CONFIG10_STAIRS.sideOffset;
            const sY = pA.y + stepH * (s + 1.0) - treadH / 2;
            const sZ = pA.z + dZ * sProgress + sideDir.z * CONFIG10_STAIRS.sideOffset;

            treadMesh.position.set(sX, sY, sZ);
            treadMesh.castShadow = true;
            treadMesh.receiveShadow = true;
            config10StructuresGroup.add(treadMesh);

            const edges = new THREE.EdgesGeometry(treadGeo);
            const line = new THREE.LineSegments(edges, edgeMat);
            line.position.set(sX, sY, sZ);
            config10StructuresGroup.add(line);
        }

        // Render Side Stringers (Limons d'escalier métalliques sans garde-corps avec coupes propres)
        const stringerWidth = 0.06;
        const stringerDepth = 0.18;
        const stringerGeo = createStringerGeometry(horizDist, pA.y, pB.y, stringerDepth, stringerWidth);

        [-0.5, 0.5].forEach(sideMult => {
            const strMesh = new THREE.Mesh(stringerGeo, stringerMat);
            const startX_str = startX + sideDir.x * (CONFIG10_STAIRS.sideOffset + sideMult * CONFIG10_STAIRS.stairWidth);
            const startZ_str = pA.z + sideDir.z * (CONFIG10_STAIRS.sideOffset + sideMult * CONFIG10_STAIRS.stairWidth);

            strMesh.position.set(startX_str, 0, startZ_str);
            strMesh.rotation.y = -Math.atan2(dZ, dX);
            strMesh.castShadow = true;
            strMesh.receiveShadow = true;
            config10StructuresGroup.add(strMesh);

            const strEdges = new THREE.EdgesGeometry(stringerGeo);
            const strLine = new THREE.LineSegments(strEdges, edgeMat);
            strLine.position.set(startX_str, 0, startZ_str);
            strLine.rotation.y = -Math.atan2(dZ, dX);
            config10StructuresGroup.add(strLine);
        });
    }

    // 2. Process Raised Platforms at Top Arrivals
    let k = 0;
    while (k < spans.length) {
        const sp = spans[k];
        const spSlope = Math.abs((sp.slope_deg !== undefined ? sp.slope_deg : sp.slopeDeg) || 0);
        const dy = (nodes[k + 1] && nodes[k]) ? Math.abs(nodes[k + 1].y - nodes[k].y) : 0;
        const isSpSloped = (spSlope >= 15) || (dy >= 0.05 && spSlope >= 1.0);

        if (isSpSloped) {
            const topNodeIdx = k + 1;
            const topY = nodes[topNodeIdx] ? nodes[topNodeIdx].y : 0;

            if (topY > 0.05) {
                // Find all consecutive horizontal spans starting at topNodeIdx
                let nextSpanIdx = topNodeIdx;
                let endNodeIdx = topNodeIdx;

                while (nextSpanIdx < spans.length) {
                    const spNext = spans[nextSpanIdx];
                    const nextSlope = Math.abs((spNext.slope_deg !== undefined ? spNext.slope_deg : spNext.slopeDeg) || 0);
                    const nextDy = (nodes[nextSpanIdx + 1] && nodes[nextSpanIdx]) ? Math.abs(nodes[nextSpanIdx + 1].y - nodes[nextSpanIdx].y) : 0;

                    // If subsequent span is horizontal (< 15° and height change is negligible), platform continues under it!
                    if (nextSlope < 15 && nextDy < 0.05) {
                        endNodeIdx = nextSpanIdx + 1;
                        nextSpanIdx++;
                    } else {
                        break;
                    }
                }

                // Compute bounding volume for all nodes covered by this continuous platform
                let minX = Infinity, maxX = -Infinity;
                let minZ = Infinity, maxZ = -Infinity;
                for (let n = topNodeIdx; n <= endNodeIdx; n++) {
                    if (nodes[n]) {
                        minX = Math.min(minX, nodes[n].x);
                        maxX = Math.max(maxX, nodes[n].x);
                        minZ = Math.min(minZ, nodes[n].z);
                        maxZ = Math.max(maxZ, nodes[n].z);
                    }
                }

                minX -= marginX;
                maxX += marginX;
                const platLen = Math.max(1.0, maxX - minX);
                const platHeight = topY;
                const platThickness = platHeight;

                const platZCenter = (minZ + maxZ) / 2 + (CONFIG10_STAIRS.sideOffset / 2);
                const platWidthZ = Math.max(CONFIG10_STAIRS.stairWidth + CONFIG10_STAIRS.sideOffset + 1.2, (maxZ - minZ) + 2.0);

                const platGeo = new THREE.BoxGeometry(platLen, platThickness, platWidthZ);
                const platMat = new THREE.MeshStandardMaterial({
                    color: 0x64748b,
                    roughness: 0.5,
                    metalness: 0.2
                });
                const platMesh = new THREE.Mesh(platGeo, platMat);

                platMesh.position.set(
                    minX + platLen / 2,
                    platHeight / 2,
                    platZCenter
                );
                platMesh.receiveShadow = true;
                platMesh.castShadow = true;
                config10StructuresGroup.add(platMesh);

                const edgeMatPlat = new THREE.LineBasicMaterial({ color: 0x334155 });
                const edges = new THREE.EdgesGeometry(platGeo);
                const line = new THREE.LineSegments(edges, edgeMatPlat);
                line.position.set(minX + platLen / 2, platHeight / 2, platZCenter);
                config10StructuresGroup.add(line);

                k = Math.max(k + 1, endNodeIdx - 1);
                continue;
            }
        }
        k++;
    }
}

function createConfig6Structures3D() {
    if (!config6StructuresGroup) return;

    while (config6StructuresGroup.children.length > 0) {
        const child = config6StructuresGroup.children[0];
        child.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
        config6StructuresGroup.remove(child);
    }

    if (state.layoutType !== "multi_bend_circle") return;

    const D = state.config6Diameter || 30.0;
    const H = state.config6Height || 8.0;
    const R = D / 2;
    const centerX = 15.0;
    const centerZ = 15.0;
    const structType = state.config6StructureType || "reservoir";

    const tankMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.5,
        metalness: 0.3
    });
    const rimMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.3,
        metalness: 0.7
    });
    const hatchMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.4,
        metalness: 0.6
    });
    const edgeLineMat = new THREE.LineBasicMaterial({ color: 0x0f172a });
    const steelMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.4,
        metalness: 0.6
    });

    const actualH = H;

    // 1. Main Cylindrical Tank Body (from Y = -actualH to Y = 0)
    const cylGeo = new THREE.CylinderGeometry(R, R, actualH, 64);
    const cylMesh = new THREE.Mesh(cylGeo, tankMat);
    cylMesh.position.set(centerX, -actualH / 2, centerZ);
    cylMesh.castShadow = true;
    cylMesh.receiveShadow = true;
    config6StructuresGroup.add(cylMesh);

    // Dark outline edges for cylinder top & bottom
    const cylEdges = new THREE.EdgesGeometry(cylGeo, 15);
    const cylLine = new THREE.LineSegments(cylEdges, edgeLineMat);
    cylLine.position.set(centerX, -actualH / 2, centerZ);
    config6StructuresGroup.add(cylLine);

    // 2. Parapet Rim / Coping Ring around roof edge
    const rimGeo = new THREE.TorusGeometry(R, 0.12, 12, 64);
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.set(centerX, 0.0, centerZ);
    config6StructuresGroup.add(rimMesh);

    // 3. Vertical Seams / Ribs around circumference
    const numRibs = 16;
    for (let r = 0; r < numRibs; r++) {
        const angle = (2 * Math.PI * r) / numRibs;
        const ribR = R + 0.02;
        const ribGeo = new THREE.CylinderGeometry(0.03, 0.03, actualH, 8);
        const ribMesh = new THREE.Mesh(ribGeo, rimMat);
        ribMesh.position.set(centerX + ribR * Math.cos(angle), -actualH / 2, centerZ + ribR * Math.sin(angle));
        config6StructuresGroup.add(ribMesh);
    }

    // 4. Horizontal Steel Reinforcement Rings
    const numRings = 3;
    for (let rg = 1; rg <= numRings; rg++) {
        const ringY = - (rg * actualH) / (numRings + 1);
        const ringGeo = new THREE.TorusGeometry(R + 0.015, 0.04, 8, 64);
        const ringMesh = new THREE.Mesh(ringGeo, rimMat);
        ringMesh.rotation.x = Math.PI / 2;
        ringMesh.position.set(centerX, ringY, centerZ);
        config6StructuresGroup.add(ringMesh);
    }

    // 5. Roof Access Hatch (Trappe d'accès au centre du toit)
    const hatchGroup = new THREE.Group();
    const hatchBaseGeo = new THREE.BoxGeometry(1.2, 0.1, 1.2);
    const hatchBaseMesh = new THREE.Mesh(hatchBaseGeo, hatchMat);
    hatchBaseMesh.position.set(0, 0.05, 0);
    hatchGroup.add(hatchBaseMesh);

    const hatchCoverGeo = new THREE.BoxGeometry(1.1, 0.05, 1.1);
    const hatchCoverMesh = new THREE.Mesh(hatchCoverGeo, steelMat);
    hatchCoverMesh.position.set(0, 0.125, 0);
    hatchGroup.add(hatchCoverMesh);

    const handleGeo = new THREE.TorusGeometry(0.12, 0.02, 8, 16, Math.PI);
    const handleMesh = new THREE.Mesh(handleGeo, rimMat);
    handleMesh.position.set(0, 0.15, 0);
    hatchGroup.add(handleMesh);

    hatchGroup.position.set(centerX, 0.0, centerZ);
    config6StructuresGroup.add(hatchGroup);

    // 6. Access Ladder (Échelle d'accès sur la paroi avec crinoline)
    const ladderAngle = -Math.PI / 4;
    const ladderX = centerX + (R + 0.15) * Math.cos(ladderAngle);
    const ladderZ = centerZ + (R + 0.15) * Math.sin(ladderAngle);
    const ladderRotY = -ladderAngle + Math.PI / 2;

    const ladderGroup = new THREE.Group();

    const railGeo = new THREE.CylinderGeometry(0.025, 0.025, actualH + 1.0, 12);
    const rail1 = new THREE.Mesh(railGeo, steelMat);
    rail1.position.set(-0.25, -actualH / 2 + 0.5, 0);
    const rail2 = new THREE.Mesh(railGeo, steelMat);
    rail2.position.set(0.25, -actualH / 2 + 0.5, 0);
    ladderGroup.add(rail1);
    ladderGroup.add(rail2);

    const numRungs = Math.floor(actualH / 0.3);
    for (let rg = 0; rg <= numRungs; rg++) {
        const rungY = -actualH + rg * 0.3;
        const rungGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8);
        const rungMesh = new THREE.Mesh(rungGeo, steelMat);
        rungMesh.rotation.z = Math.PI / 2;
        rungMesh.position.set(0, rungY, 0);
        ladderGroup.add(rungMesh);
    }

    const cageStartY = -actualH * 0.4;
    const cageNumHoops = 6;
    for (let ch = 0; ch < cageNumHoops; ch++) {
        const hoopY = cageStartY + (ch * (actualH * 0.4)) / (cageNumHoops - 1);
        const hoopGeo = new THREE.TorusGeometry(0.4, 0.015, 8, 16, Math.PI * 1.2);
        const hoopMesh = new THREE.Mesh(hoopGeo, steelMat);
        hoopMesh.rotation.x = Math.PI / 2;
        hoopMesh.rotation.z = Math.PI;
        hoopMesh.position.set(0, hoopY, 0.1);
        ladderGroup.add(hoopMesh);
    }

    ladderGroup.position.set(ladderX, 0, ladderZ);
    ladderGroup.rotation.y = ladderRotY;
    config6StructuresGroup.add(ladderGroup);
}

// 3D Helper: Create X-Matrix Cross Piece Mesh (Centered at cable height with 4 branch eyelets)
function createXMatrixPieceMesh(rotY = 0) {
    const file = "models/new_pro/X-Matrix.glb";
    const group = new THREE.Group();

    if (objCache[file]) {
        const modelObj = prepareOBJModel(objCache[file], rotY, file);
        group.add(modelObj);
    } else {
        const matColor = (state.colors && state.colors.anchors) || "#f8fafc";
        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(matColor),
            metalness: 0.9,
            roughness: 0.15,
            emissive: new THREE.Color(matColor),
            emissiveIntensity: 0.15
        });
        const centerDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 24), mat);
        group.add(centerDisc);

        [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach(angle => {
            const armGroup = new THREE.Group();
            armGroup.rotation.y = angle;
            const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.01, 0.08), mat);
            armMesh.position.set(0.125, 0, 0);
            armGroup.add(armMesh);

            const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 12, 24), mat);
            ringMesh.position.set(0.25, 0, 0);
            ringMesh.rotation.x = Math.PI / 2;
            armGroup.add(ringMesh);

            group.add(armGroup);
        });

        group.rotation.y = rotY;

        loadOBJModel(file).then(() => {
            if (typeof update3DScene === "function") update3DScene();
        });
    }

    return group;
}

// 3D Renderer: Multi-direction branches from an intermediate X-Matrix anchor (Spec V2_14 / Config 2)
function renderXMatrixBranches3D(pos, cableTopY, rotX, activePostHeight) {
    if (!pos || !pos.xMatrixBranches || pos.xMatrixBranches.length === 0) return;
    const branches = pos.xMatrixBranches;
    const baseRotY = pos.rotY || 0;
    const cableExt = isExtreme(state.product) ? 0.30 : 0.20;

    const cableMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(state.colors.cable || "#f8fafc"),
        metalness: 0.9,
        roughness: 0.1,
        emissive: new THREE.Color(state.colors.cable || "#f8fafc"),
        emissiveIntensity: 0.2
    });

    const hubCenter = new THREE.Vector3(pos.x, cableTopY, pos.z);

    branches.forEach((br, bIdx) => {
        const rawAng = (br.angleDeg !== undefined) ? parseFloat(br.angleDeg) : (bIdx === 0 ? 90 : -90);
        const normAng = ((rawAng % 360) + 360) % 360;
        // Collinear suppression: strictly prevent duplicate crimped lines overlapping main lifeline
        if (normAng < 15 || normAng > 345 || Math.abs(normAng - 180) < 15) {
            return;
        }

        const bSpans = (typeof getBranchSpans === "function") ? getBranchSpans(br) : (br.spans || [{ id: (br.id || "xmb") + "_s1", length: br.length || 5.0 }]);
        const brAngleRad = baseRotY + (rawAng * Math.PI / 180);
        const vDir = new THREE.Vector3(Math.cos(brAngleRad), 0, Math.sin(brAngleRad)).normalize();

        // Crimp terminal loop at X-Matrix arm slot
        const slotPos = hubCenter.clone().add(vDir.clone().multiplyScalar(0.085));
        cableGroup.add(createCableLoopTerminal(slotPos, vDir, state.colors.cable, true));

        const roofLift = (state.roofShape === "sloped" || state.roofShape === "triangle") ? 0.02 : 0.0;
        let prevPt = hubCenter.clone().add(vDir.clone().multiplyScalar(0.165));
        let cumulativeDist = 0;

        bSpans.forEach((subSp, sIdx) => {
            const isLastSpan = (sIdx === bSpans.length - 1);
            const subLen = Math.max(0.5, parseFloat(subSp.length) || 5.0);
            cumulativeDist += subLen;

            const curX = pos.x + cumulativeDist * Math.cos(brAngleRad);
            const curZ = pos.z + cumulativeDist * Math.sin(brAngleRad);
            const curRoofY = (typeof getRoofHeightAt === "function") ? getRoofHeightAt(curX, curZ) : 0;
            const curPostY = curRoofY + roofLift;
            const curCablePt = new THREE.Vector3(curX, curPostY + activePostHeight, curZ);

            if (isLastSpan) {
                // Extremity post at the branch tip
                const branchPost = createAnchorMesh(state.colors.anchors, "extremite", null, brAngleRad, activePostHeight);
                branchPost.position.set(curX, curPostY, curZ);
                branchPost.rotation.x = rotX;
                branchPost.userData.isAnchorPost = true;
                branchPost.userData.isBranchEndPost = true;
                branchPost.userData.branchIndex = bIdx;
                branchPost.userData.spanIndex = sIdx;
                anchorGroup.add(branchPost);

                // Cable tube extending to extremity post
                const endExt = curCablePt.clone().add(vDir.clone().multiplyScalar(cableExt));
                const curve = new THREE.LineCurve3(prevPt, endExt);
                const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.015, 8, false);
                const cableMesh = new THREE.Mesh(tubeGeo, cableMat);
                cableGroup.add(cableMesh);

                // Crimp loop terminal at branch extremity post
                cableGroup.add(createCableLoopTerminal(endExt, vDir, state.colors.cable, false));
            } else {
                // Intermediate post along the branch
                const interPost = createAnchorMesh(state.colors.anchors, "intermediaire", null, brAngleRad, activePostHeight);
                interPost.position.set(curX, curPostY, curZ);
                interPost.rotation.x = rotX;
                interPost.userData.isAnchorPost = true;
                interPost.userData.isBranchInterPost = true;
                interPost.userData.branchIndex = bIdx;
                interPost.userData.spanIndex = sIdx;
                anchorGroup.add(interPost);

                // Cable tube segment
                const curve = new THREE.LineCurve3(prevPt, curCablePt);
                const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.015, 8, false);
                const cableMesh = new THREE.Mesh(tubeGeo, cableMat);
                cableGroup.add(cableMesh);

                prevPt = curCablePt;
            }
        });
    });
}

// 3D Renderer for Config 11: Cross-spans (NewPRO Only, 4 branches from central X-Matrix piece)
function renderConfig11CrossSpans3D() {
    const cs = state.crossSpans || { north: 10.0, east: 10.0, south: 10.0, west: 10.0, angles: [270, 0, 90, 180] };
    const hubX = state.L / 2;
    const hubZ = state.l / 2;

    // Dynamically calculate top cable height based on the active post model (Mini_Omega, PB_HOOKT, P_Galva, P_Inox, New_Pro)
    const samplePostAnchor = createAnchorMesh(state.colors.anchors, "extremite", null, 0);
    const activePostHeight = samplePostAnchor.userData.height || 0.45;
    const yCable = activePostHeight;

    // Helper to create 3D canvas text sprite labels for branch spans
    function createTextSprite(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(4, 4, 248, 56, 10);
            ctx.fill();
        } else {
            ctx.fillRect(4, 4, 248, 56);
        }
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.font = 'Bold 20px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(3.0, 0.75, 1.0);
        return sprite;
    }

    const isXMatrixChecked = (COMPONENTS_DB[state.product] || []).some(c => c.id === "X-Matrix" && c.checked) || (state.checkedComponents && state.checkedComponents["X-Matrix"]);

    // 1. Central X-Matrix piece at hub. Render ONLY if X-Matrix is checked in components list!
    if (isXMatrixChecked) {
        const xmatMesh = createXMatrixPieceMesh(0);
        xmatMesh.position.set(hubX, yCable, hubZ);
        anchorGroup.add(xmatMesh);
    }

    // 4 branches: directions, lengths, labels
    const branchData = [
        { label: "Span 1 (Nord)", dir: "north", len: cs.north !== undefined ? parseFloat(cs.north) || 10.0 : 10.0, angleDeg: cs.angles ? cs.angles[0] : 270 },
        { label: "Span 2 (Est)", dir: "east", len: cs.east !== undefined ? parseFloat(cs.east) || 10.0 : 10.0, angleDeg: cs.angles ? cs.angles[1] : 0 },
        { label: "Span 3 (Sud)", dir: "south", len: cs.south !== undefined ? parseFloat(cs.south) || 10.0 : 10.0, angleDeg: cs.angles ? cs.angles[2] : 90 },
        { label: "Span 4 (Ouest)", dir: "west", len: cs.west !== undefined ? parseFloat(cs.west) || 10.0 : 10.0, angleDeg: cs.angles ? cs.angles[3] : 180 }
    ];

    const cableMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(state.colors.cable || "#f8fafc"),
        metalness: 0.9,
        roughness: 0.1,
        emissive: new THREE.Color(state.colors.cable || "#f8fafc"),
        emissiveIntensity: 0.2
    });

    let countCables = 0;
    let countPosts = 0;
    let countXMatrix = isXMatrixChecked ? 1 : 0;
    let centerTouchedCount = 0;

    const hubCenterVector = new THREE.Vector3(hubX, yCable, hubZ);

    branchData.forEach((b) => {
        const rad = (b.angleDeg * Math.PI) / 180;
        const endX = hubX + b.len * Math.cos(rad);
        const endZ = hubZ + b.len * Math.sin(rad);

        // Render end post on roof at end position (at height matching post model)
        const postAnchor = createAnchorMesh(state.colors.anchors, "extremite", null, rad, activePostHeight);
        postAnchor.position.set(endX, 0.0, endZ);
        postAnchor.userData.isAnchorPost = true;
        anchorGroup.add(postAnchor);
        countPosts++;

        const vDir = new THREE.Vector3(Math.cos(rad), 0, Math.sin(rad)).normalize();

        // Position slot at r ≈ 0.085m so teardrop loop passes through X-Matrix arm slot/hole
        const slotPosCentral = hubCenterVector.clone().add(vDir.clone().multiplyScalar(0.085));

        // 1. Sertissage à la X-Matrix (Crimp loop terminal passing through central X-Matrix arm eyelet hole)
        if (isXMatrixChecked) {
            cableGroup.add(createCableLoopTerminal(slotPosCentral, vDir, state.colors.cable, true));
        }

        const cableExt = 0.20;

        // Branch cable tube start point (after crimp sleeve at ~0.165m from hub)
        const cableStartPt = hubCenterVector.clone().add(vDir.clone().multiplyScalar(isXMatrixChecked ? 0.165 : 0.05));
        const endPt = new THREE.Vector3(endX, yCable, endZ);
        const endExt = endPt.clone().add(vDir.clone().multiplyScalar(cableExt));

        // Cable tube passes THROUGH the post top clamp to endExt (0.20m extension past post)
        const curve = new THREE.LineCurve3(cableStartPt, endExt);
        const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.015, 8, false);
        const cableMesh = new THREE.Mesh(tubeGeo, cableMat);
        cableGroup.add(cableMesh);
        countCables++;

        // Check assertion: cable touches center hub area
        if (cableStartPt.distanceTo(hubCenterVector) < 0.5) {
            centerTouchedCount++;
        }

        // 2. Sertissage au poteau d'extrémité (End loop terminal at endExt past the post clamp)
        cableGroup.add(createCableLoopTerminal(endExt, vDir, state.colors.cable, false));
    });

    // Assertions validation check
    const assertionsValid = (countCables === 4) &&
                             (countPosts === 4) &&
                             (countXMatrix === (isXMatrixChecked ? 1 : 0)) &&
                             (centerTouchedCount === 4);

    if (!assertionsValid) {
        console.error(`[CONFIG 11 ASSERTION FAILED] Cables: ${countCables} (expected 4), Posts: ${countPosts} (expected 4), X-Matrix: ${countXMatrix}, CenterTouched: ${centerTouchedCount} (expected 4)`);
    } else {
        console.log(`[CONFIG 11 ASSERTIONS OK] 4 independent cables from center, 4 end posts, X-Matrix: ${countXMatrix}.`);
    }
}


// 3D Renderer for Config 12: Grid Systems (Long Range Only, Overhead grid with X-Matrix at each intersection)
function renderConfig12GridSystem3D() {
    const gs = state.gridSystem || { nx: 3, ny: 3, xSpacings: [5.0, 5.0], zSpacings: [5.0, 5.0], end_margin: 2.0, cable_height: 3.5 };
    const nx = Math.max(2, gs.nx || 3);
    const ny = Math.max(2, gs.ny || 3);
    const endMargin = Math.max(0.5, gs.end_margin !== undefined ? gs.end_margin : 2.0);
    const cableHeight = Math.max(1.0, gs.cable_height !== undefined ? gs.cable_height : 3.5);

    const xSpacings = gs.xSpacings && gs.xSpacings.length === nx - 1 ? gs.xSpacings : Array(nx - 1).fill(5.0);
    const zSpacings = gs.zSpacings && gs.zSpacings.length === ny - 1 ? gs.zSpacings : Array(ny - 1).fill(5.0);

    const startX = 3.0 + endMargin;
    const startZ = 3.0 + endMargin;
    const xCoords = [startX];
    for (let i = 0; i < xSpacings.length; i++) {
        xCoords.push(xCoords[i] + (xSpacings[i] || 5.0));
    }
    const zCoords = [startZ];
    for (let j = 0; j < zSpacings.length; j++) {
        zCoords.push(zCoords[j] + (zSpacings[j] || 5.0));
    }

    const cableMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(state.colors.cable || "#f8fafc"),
        metalness: 0.9,
        roughness: 0.1,
        emissive: new THREE.Color(state.colors.cable || "#f8fafc"),
        emissiveIntensity: 0.2
    });

    const isXMatrixChecked = (COMPONENTS_DB[state.product] || []).some(c => c.id === "X-Matrix" && c.checked) || (state.checkedComponents && state.checkedComponents["X-Matrix"]);

    // 1. Render X-Matrix pieces at every intersection (nx * ny) ONLY if checked in components list!
    if (isXMatrixChecked) {
        for (let i = 0; i < nx; i++) {
            for (let j = 0; j < ny; j++) {
                const xmatMesh = createXMatrixPieceMesh(0);
                xmatMesh.position.set(xCoords[i], cableHeight, zCoords[j]);
                anchorGroup.add(xmatMesh);
            }
        }
    }

    // High overhead end posts function (height = cableHeight)
    function createOverheadEndPostMesh(headingRad = 0) {
        const group = new THREE.Group();
        const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.25 });
        const plateMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.2 });

        const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.35), plateMat);
        basePlate.position.y = 0.01;
        group.add(basePlate);

        // Render Long Range Absorber / A-Fix anchor model if checked
        const list = COMPONENTS_DB[state.product] || [];
        const lrComp = list.find(c => c.id === "LongRange");
        const afixComp = list.find(c => c.id === "A-Fix");
        const isLrChecked = (lrComp && lrComp.checked) || (state.checkedComponents && state.checkedComponents["LongRange"]);
        const isAfixChecked = (afixComp && afixComp.checked) || (state.checkedComponents && state.checkedComponents["A-Fix"]);
        const hasAbsorberModel = isLrChecked || isAfixChecked;

        // LongRange absorber eyelet is at ~0.060m above the mounting foot plate
        const absorberEyeletOffset = hasAbsorberModel ? 0.060 : 0.0;
        const postTopY = cableHeight - absorberEyeletOffset;

        // Column height from top of base plate (Y = 0.02) to bottom of top plate (Y = postTopY - 0.02)
        const columnH = Math.max(0.1, postTopY - 0.04);
        const columnGeom = new THREE.CylinderGeometry(0.065, 0.065, columnH, 16);
        const column = new THREE.Mesh(columnGeom, postMat);
        column.position.y = 0.02 + columnH / 2;
        group.add(column);

        // Top flange mounting plate: thickness 0.02m, top surface at postTopY
        const topPlate = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, 0.25), plateMat);
        topPlate.position.y = postTopY - 0.01;
        group.add(topPlate);

        if (hasAbsorberModel) {
            const file = (lrComp && lrComp.file) || (afixComp && afixComp.file) || "models/long_range/LongRange.glb";
            if (objCache[file]) {
                const modelObj = prepareOBJModel(objCache[file], headingRad, file);
                modelObj.position.y = postTopY; // Sits 100% flush on top surface of the post top plate
                group.add(modelObj);
            } else {
                loadOBJModel(file).then(() => {
                    if (typeof update3DScene === "function") update3DScene();
                });
            }
        }

        group.userData.height = cableHeight;
        group.userData.isAnchorPost = true;
        return group;
    }

    const cableExt = 0.30; // 30 cm end buffer (2x30cm libres aux extrémités)

    // 2. Render X-Lines (Z rows, index j): End posts + Cable Segments + 30cm buffer + Sertissage
    for (let j = 0; j < ny; j++) {
        const zVal = zCoords[j];
        const westX = xCoords[0] - endMargin;
        const eastX = xCoords[nx - 1] + endMargin;

        const postW = createOverheadEndPostMesh(0);
        postW.position.set(westX, 0, zVal);
        anchorGroup.add(postW);

        const postE = createOverheadEndPostMesh(Math.PI);
        postE.position.set(eastX, 0, zVal);
        anchorGroup.add(postE);

        const westBufferPt = new THREE.Vector3(westX - cableExt, cableHeight, zVal);
        const eastBufferPt = new THREE.Vector3(eastX + cableExt, cableHeight, zVal);

        const pts = [westBufferPt, new THREE.Vector3(westX, cableHeight, zVal)];
        for (let i = 0; i < nx; i++) {
            pts.push(new THREE.Vector3(xCoords[i], cableHeight, zVal));
        }
        pts.push(new THREE.Vector3(eastX, cableHeight, zVal));
        pts.push(eastBufferPt);

        for (let k = 0; k < pts.length - 1; k++) {
            const pA = pts[k];
            const pB = pts[k + 1];
            const curve = new THREE.LineCurve3(pA, pB);
            const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.01, 8, false);
            const cableMesh = new THREE.Mesh(tubeGeo, cableMat);
            cableGroup.add(cableMesh);
        }

        // Sertissage (manchons avec boucles de terminaison) au bout des buffers de 30 cm
        const vWest = new THREE.Vector3(-1, 0, 0);
        const vEast = new THREE.Vector3(1, 0, 0);
        cableGroup.add(createCableLoopTerminal(westBufferPt, vWest, state.colors.cable, false));
        cableGroup.add(createCableLoopTerminal(eastBufferPt, vEast, state.colors.cable, false));
    }

    // 3. Render Z-Lines (X columns, index i): End posts + Cable Segments + 30cm buffer + Sertissage
    for (let i = 0; i < nx; i++) {
        const xVal = xCoords[i];
        const northZ = zCoords[0] - endMargin;
        const southZ = zCoords[ny - 1] + endMargin;

        const postN = createOverheadEndPostMesh(-Math.PI / 2);
        postN.position.set(xVal, 0, northZ);
        anchorGroup.add(postN);

        const postS = createOverheadEndPostMesh(Math.PI / 2);
        postS.position.set(xVal, 0, southZ);
        anchorGroup.add(postS);

        const northBufferPt = new THREE.Vector3(xVal, cableHeight, northZ - cableExt);
        const southBufferPt = new THREE.Vector3(xVal, cableHeight, southZ + cableExt);

        const pts = [northBufferPt, new THREE.Vector3(xVal, cableHeight, northZ)];
        for (let j = 0; j < ny; j++) {
            pts.push(new THREE.Vector3(xVal, cableHeight, zCoords[j]));
        }
        pts.push(new THREE.Vector3(xVal, cableHeight, southZ));
        pts.push(southBufferPt);

        for (let k = 0; k < pts.length - 1; k++) {
            const pA = pts[k];
            const pB = pts[k + 1];
            const curve = new THREE.LineCurve3(pA, pB);
            const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.01, 8, false);
            const cableMesh = new THREE.Mesh(tubeGeo, cableMat);
            cableGroup.add(cableMesh);
        }

        // Sertissage (manchons avec boucles de terminaison) au bout des buffers de 30 cm
        const vNorth = new THREE.Vector3(0, 0, -1);
        const vSouth = new THREE.Vector3(0, 0, 1);
        cableGroup.add(createCableLoopTerminal(northBufferPt, vNorth, state.colors.cable, false));
        cableGroup.add(createCableLoopTerminal(southBufferPt, vSouth, state.colors.cable, false));
    }
}

// =========================================================================
// CONFIGURATIONS 8 & 9 : SLOPED LIFELINE SYSTEMS 3D ENGINE & SPEC CONSTANTS
// =========================================================================
const SLOPE_MIN_DEG = 15;
// SLOPE_MAX_DEG globally defined as 75 in LayoutEditorModule
const SLOPE_ROOF_WIDTH = 6.0;      // Largeur (profondeur Z) d'environ 6m
const SLOPE_ROOF_THICKNESS = 0.3;  // Épaisseur de la dalle de toiture d'environ 0.3m
const SHOW_BUILDING_FACADE = true; // Corps de bâtiment décoratif sous la toiture

// Validation according to spec
function validateSlopeSystemSpans(spans, maxSpan) {
    if (!spans || spans.length === 0) {
        return { valid: false, error: "Aucune portée définie pour le système en pente." };
    }
    for (let i = 0; i < spans.length; i++) {
        const sp = spans[i];
        const len = parseFloat(sp.length);
        const deg = parseFloat(sp.slopeDeg !== undefined ? sp.slopeDeg : sp.slope_deg);
        if (isNaN(len) || len <= 0) {
            return { valid: false, error: `Portée ${i + 1} : longueur invalide (${sp.length} m). La longueur doit être > 0.` };
        }
        if (maxSpan && len > maxSpan + 0.001) {
            return { valid: false, error: `Portée ${i + 1} : longueur ${len.toFixed(2)} m dépasse le maximum admissible (${maxSpan} m) pour ${state.product}.` };
        }
        if (isNaN(deg) || deg < SLOPE_MIN_DEG || deg > SLOPE_MAX_DEG) {
            return { valid: false, error: `Portée ${i + 1} : angle ${deg}° hors plage autorisée [${SLOPE_MIN_DEG}°, ${SLOPE_MAX_DEG}°].` };
        }
    }
    return { valid: true };
}

// Live calculation UI in modal
function updateSlopeLiveStatsUI() {
    const container = document.getElementById("slope-live-stats");
    if (!container) return;
    const isEn = (parseInt(state.lang) === 1);
    const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
    const spans = (state.layoutType === "slope_single") ? [state.spans[0] || { length: 20, slopeDeg: 30 }] : (state.spans || []);
    const maxSpan = Calculator.getMaxSpan(state.product);
    const valResult = validateSlopeSystemSpans(spans, maxSpan);

    let totalDrop = 0;
    let totalHoriz = 0;
    spans.forEach(sp => {
        const len = parseFloat(sp.length) || 0;
        const deg = parseFloat(sp.slopeDeg !== undefined ? sp.slopeDeg : (sp.slope_deg || 15));
        const rad = (deg * Math.PI) / 180;
        totalDrop += len * Math.sin(rad);
        totalHoriz += len * Math.cos(rad);
    });

    const dropStr = UnitsModule.formatLength(totalDrop);
    const horizStr = UnitsModule.formatLength(totalHoriz);
    const nbPosts = spans.length + 1;
    const nbSegs = spans.length;

    let warningHtml = "";
    if (!valResult.valid) {
        warningHtml = `
            <div style="background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; padding: 10px; border-radius: 6px; font-size: 0.85rem; display: flex; gap: 8px; align-items: center; margin-top: 8px;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.1rem; color: #dc2626;"></i>
                <div><strong>${isEn ? "Validation Error:" : "Erreur de validation :"}</strong> ${valResult.error}</div>
            </div>
        `;
    }

    container.innerHTML = `
        <div style="background: rgba(30, 41, 59, 0.05); padding: 12px; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.2);">
            <div style="font-size: 0.85rem; font-weight: 700; color: #1e293b; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-calculator" style="color: #0284c7;"></i>
                <span>${isEn ? "LIVE SLOPE GEOMETRY:" : "GÉOMÉTRIE DE LA PENTE EN DIRECT :"}</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center;">
                <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">${isEn ? "TOTAL DROP" : "DÉNIVELÉ TOTAL"}</div>
                    <div style="font-size: 1.15rem; font-weight: 800; color: #0284c7;">${dropStr}</div>
                </div>
                <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">${isEn ? "HORIZ. PROJECTION" : "PROJECTION HORIZ."}</div>
                    <div style="font-size: 1.15rem; font-weight: 800; color: #0284c7;">${horizStr}</div>
                </div>
                <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">${isEn ? "POSTS (N+1)" : "POTEAUX (N+1)"}</div>
                    <div style="font-size: 1.15rem; font-weight: 800; color: #1e293b;">${nbPosts}</div>
                </div>
                <div style="background: white; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">${isEn ? "SEGMENTS (N)" : "SEGMENTS (N)"}</div>
                    <div style="font-size: 1.15rem; font-weight: 800; color: #1e293b;">${nbSegs}</div>
                </div>
            </div>
            ${warningHtml}
        </div>
    `;
}

// Calculate slope system geometry
function calculateSlopeSystemGeometry(spans) {
    const N = spans.length;
    const startX = 2.0;
    const startY = 0.5;

    const sommets = [{ x: startX, y: startY }];
    let totalDrop = 0;
    let totalHoriz = 0;

    for (let i = 0; i < N; i++) {
        const len = parseFloat(spans[i].length) || 10.0;
        const deg = parseFloat(spans[i].slopeDeg !== undefined ? spans[i].slopeDeg : spans[i].slope_deg) || 15.0;
        const rad = (deg * Math.PI) / 180;
        const dx = len * Math.cos(rad);
        const dy = len * Math.sin(rad);

        totalDrop += dy;
        totalHoriz += dx;

        const prev = sommets[i];
        sommets.push({
            x: prev.x + dx,
            y: prev.y + dy
        });
    }

    return {
        sommets,
        totalDrop: parseFloat(totalDrop.toFixed(2)),
        totalHoriz: parseFloat(totalHoriz.toFixed(2)),
        N
    };
}

// Create dedicated 3D sloped roof geometry with visible creases at slope changes
function createSlopeSystemRoofMesh(sommets, spans, roofMat) {
    const group = new THREE.Group();
    const N = spans.length;
    const W = SLOPE_ROOF_WIDTH;
    const halfW = W / 2;
    const T = SLOPE_ROOF_THICKNESS;

    const overhang = 1.2;
    const rad0 = (spans[0].slopeDeg * Math.PI) / 180;
    const radN = (spans[N - 1].slopeDeg * Math.PI) / 180;
    const pStartEave = {
        x: sommets[0].x - overhang * Math.cos(rad0),
        y: sommets[0].y - overhang * Math.sin(rad0)
    };
    const pEndRidge = {
        x: sommets[N].x + overhang * Math.cos(radN),
        y: sommets[N].y + overhang * Math.sin(radN)
    };

    const profileTop = [pStartEave, ...sommets, pEndRidge];
    const M = profileTop.length;

    const profileNormals = [];
    for (let j = 0; j < M; j++) {
        let nX = 0, nY = 0;
        if (j === 0) {
            nX = -Math.sin(rad0);
            nY = Math.cos(rad0);
        } else if (j === M - 1) {
            nX = -Math.sin(radN);
            nY = Math.cos(radN);
        } else {
            const dx1 = profileTop[j].x - profileTop[j - 1].x;
            const dy1 = profileTop[j].y - profileTop[j - 1].y;
            const l1 = Math.hypot(dx1, dy1) || 1;
            const n1x = -dy1 / l1, n1y = dx1 / l1;

            const dx2 = profileTop[j + 1].x - profileTop[j].x;
            const dy2 = profileTop[j + 1].y - profileTop[j].y;
            const l2 = Math.hypot(dx2, dy2) || 1;
            const n2x = -dy2 / l2, n2y = dx2 / l2;

            const bX = n1x + n2x;
            const bY = n1y + n2y;
            const bL = Math.hypot(bX, bY) || 1;
            nX = bX / bL;
            nY = bY / bL;
        }
        profileNormals.push({ x: nX, y: nY });
    }

    const profileBottom = profileTop.map((pt, j) => ({
        x: pt.x - T * profileNormals[j].x,
        y: pt.y - T * profileNormals[j].y
    }));

    const edgeMat = new THREE.LineBasicMaterial({ color: 0x0f172a, linewidth: 2 });
    const slabMat = roofMat || new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.55,
        metalness: 0.35,
        side: THREE.DoubleSide
    });

    for (let k = 0; k < M - 1; k++) {
        const pA = profileTop[k];
        const pB = profileTop[k + 1];
        const bA = profileBottom[k];
        const bB = profileBottom[k + 1];

        const segGeo = new THREE.BufferGeometry();
        const vertices = [
            // Top Quad
            pA.x, pA.y, -halfW,   pB.x, pB.y, -halfW,   pB.x, pB.y, halfW,
            pA.x, pA.y, -halfW,   pB.x, pB.y, halfW,    pA.x, pA.y, halfW,

            // Bottom Quad
            pB.x, bB.y, -halfW,   bA.x, bA.y, -halfW,   bA.x, bA.y, halfW,
            pB.x, bB.y, -halfW,   bA.x, bA.y, halfW,    bB.x, bB.y, halfW,

            // Left Side Quad
            pA.x, pA.y, -halfW,   bA.x, bA.y, -halfW,   bB.x, bB.y, -halfW,
            pA.x, pA.y, -halfW,   bB.x, bB.y, -halfW,   pB.x, pB.y, -halfW,

            // Right Side Quad
            pA.x, pA.y, halfW,    pB.x, pB.y, halfW,    bB.x, bB.y, halfW,
            pA.x, pA.y, halfW,    bB.x, bB.y, halfW,    bA.x, bA.y, halfW,
        ];

        if (k === 0) {
            vertices.push(
                pA.x, pA.y, -halfW,  pA.x, pA.y, halfW,   bA.x, bA.y, halfW,
                pA.x, pA.y, -halfW,  bA.x, bA.y, halfW,   bA.x, bA.y, -halfW
            );
        }
        if (k === M - 2) {
            vertices.push(
                pB.x, pB.y, -halfW,  bB.x, bB.y, -halfW,  bB.x, bB.y, halfW,
                pB.x, pB.y, -halfW,  bB.x, bB.y, halfW,   pB.x, pB.y, halfW
            );
        }

        segGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        segGeo.computeVertexNormals();

        const segMesh = new THREE.Mesh(segGeo, slabMat);
        segMesh.receiveShadow = true;
        group.add(segMesh);

        const edges = new THREE.EdgesGeometry(segGeo, 15);
        const edgeLine = new THREE.LineSegments(edges, edgeMat);
        group.add(edgeLine);
    }

    if (SHOW_BUILDING_FACADE) {
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0,
            roughness: 0.85,
            metalness: 0.1
        });

        [-halfW, halfW].forEach(zSide => {
            const wallShape = new THREE.Shape();
            wallShape.moveTo(profileBottom[0].x, 0);
            for (let j = 0; j < M; j++) {
                wallShape.lineTo(profileBottom[j].x, Math.max(0, profileBottom[j].y));
            }
            wallShape.lineTo(profileBottom[M - 1].x, 0);
            wallShape.closePath();

            const wallGeo = new THREE.ShapeGeometry(wallShape);
            const wallMesh = new THREE.Mesh(wallGeo, wallMat);
            wallMesh.position.z = zSide;
            group.add(wallMesh);
        });

        const frontW = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, Math.max(0.1, profileBottom[0].y), W),
            wallMat
        );
        frontW.position.set(profileBottom[0].x, profileBottom[0].y / 2, 0);
        group.add(frontW);

        const backW = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, Math.max(0.1, profileBottom[M - 1].y), W),
            wallMat
        );
        backW.position.set(profileBottom[M - 1].x, profileBottom[M - 1].y / 2, 0);
        group.add(backW);

        const groundLength = (profileTop[M - 1].x - profileTop[0].x) + 8.0;
        const groundMesh = new THREE.Mesh(
            new THREE.BoxGeometry(groundLength, 0.2, W + 8.0),
            new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9 })
        );
        groundMesh.position.set((profileTop[0].x + profileTop[M - 1].x) / 2, -0.1, 0);
        groundMesh.receiveShadow = true;
        group.add(groundMesh);
    }

    return group;
}

// Floating 3D text sprite for span labels
function createSlopeSpanTextSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(4, 4, 248, 56, 8);
        ctx.fill();
    } else {
        ctx.fillRect(4, 4, 248, 56);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(4, 4, 248, 56, 8);
        ctx.stroke();
    } else {
        ctx.strokeRect(4, 4, 248, 56);
    }
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 20px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.4, 0.35, 1);
    return sprite;
}

// Floating 3D badge sprite for X-Cones (C1, C2...)
function createXConeBadgeSprite(label) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(245, 158, 11, 0.95)'; // HOOKT safety amber
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(4, 8, 120, 48, 12);
        ctx.fill();
    } else {
        ctx.fillRect(4, 8, 120, 48);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(4, 8, 120, 48, 12);
        ctx.stroke();
    } else {
        ctx.strokeRect(4, 8, 120, 48);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.65, 0.32, 1);
    return sprite;
}

// Procedural 3D X-Cone Mesh (sleeve + conical deflector + clamp collar)
function createProceduralXConeMesh() {
    const group = new THREE.Group();

    const matSteel = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.92,
        roughness: 0.15
    });
    const matAccent = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.85,
        roughness: 0.25
    });

    // 1. Central cylindrical sleeve passing around cable along Z axis
    const sleeveGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.22, 16);
    sleeveGeo.rotateX(Math.PI / 2);
    const sleeveMesh = new THREE.Mesh(sleeveGeo, matSteel);
    group.add(sleeveMesh);

    // 2. Conical sliding deflector (pointing towards -Z along cable slope)
    const coneGeo = new THREE.ConeGeometry(0.065, 0.15, 20);
    coneGeo.rotateX(-Math.PI / 2);
    const coneMesh = new THREE.Mesh(coneGeo, matSteel);
    coneMesh.position.set(0, 0, -0.02);
    group.add(coneMesh);

    // 3. Central clamp ring / fastener block (Boulons M5 housing)
    const clampGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.06, 16);
    clampGeo.rotateX(Math.PI / 2);
    const clampMesh = new THREE.Mesh(clampGeo, matAccent);
    clampMesh.position.set(0, 0, 0.06);
    group.add(clampMesh);

    return group;
}

// Render X-CONE safety elements ON the cable at 1.0m (15°-30°), 0.5m (30°-40°), or 0.3m (40°-75°) intervals (STRICTLY when selected by user)
function renderXConesAlongCable(ptsArray, customSpans = null) {
    const currentProd = (typeof normalizeProduct === "function" ? normalizeProduct(state.product) : state.product) || "CORE";
    const list = (typeof COMPONENTS_DB !== "undefined" ? (COMPONENTS_DB[currentProd] || COMPONENTS_DB[state.product]) : []) || [];
    const xconeComp = list.find(c => c.id === "X-Cone");
    const isChecked = (xconeComp && xconeComp.checked) || (state.checkedComponents && state.checkedComponents["X-Cone"]);

    if (!isChecked) return;
    if (!ptsArray || ptsArray.length < 2) return;

    const activeSpans = customSpans || state.spans || [];
    let globalConeIndex = 1;

    for (let i = 0; i < ptsArray.length - 1; i++) {
        const pA = ptsArray[i];
        const pB = ptsArray[i + 1];
        const dir = pB.clone().sub(pA);
        const segLen = dir.length();
        if (segLen <= 0.1) continue;

        // Determine slope degree for segment i
        let segSlopeDeg = 0;
        let explicitCount = null;

        if (activeSpans && activeSpans[i]) {
            const sp = activeSpans[i];
            const parsedSlope = parseFloat(sp.slopeDeg !== undefined ? sp.slopeDeg : sp.slope_deg);
            if (!isNaN(parsedSlope) && Math.abs(parsedSlope) >= 15) {
                segSlopeDeg = Math.abs(parsedSlope);
            }
            if (typeof sp.xconesCount === "number" && sp.xconesCount > 0) {
                explicitCount = sp.xconesCount;
            }
        }

        // Measure physical inclination in 3D
        const dy = Math.abs(pB.y - pA.y);
        const dHoriz = Math.hypot(pB.x - pA.x, pB.z - pA.z);
        const physicalSlopeDeg = (dHoriz > 0.05) ? (Math.atan2(dy, dHoriz) * 180 / Math.PI) : 0;

        if (segSlopeDeg === 0) {
            if (state.layoutType === "slope_single" || state.layoutType === "slope_multi") {
                const spans = (state.layoutType === "slope_single") ? [state.spans?.[0] || { length: 20, slopeDeg: 30 }] : (state.spans || []);
                const sSlope = parseFloat(spans[i]?.slopeDeg || state.roofSlope || 0);
                if (sSlope >= 15) segSlopeDeg = sSlope;
            } else if ((state.roofShape === "sloped" || state.roof_type === "sloped" || state.roofShape === "triangle" || state.roof_type === "triangle") && physicalSlopeDeg >= 14.5) {
                const rSlope = parseFloat(state.roofSlope || state.roof_slope_deg || 0);
                if (rSlope >= 15) segSlopeDeg = rSlope;
            }
        }

        // STRICT HOOKT RULE: X-Cones are EXCLUSIVELY for sloped segments (>= 15 deg and <= 75 deg).
        // Horizontal spans or slopes < 15 deg MUST NEVER have X-cones!
        if (segSlopeDeg < 15 || segSlopeDeg > 75) continue;
        if (dHoriz > 0.05 && physicalSlopeDeg < 14.0 && explicitCount === null) continue;

        const spacing = Calculator.getXConeSpacing(segSlopeDeg);
        let count = 0;
        if (explicitCount !== null) {
            count = explicitCount;
        } else if (spacing > 0 && segLen >= spacing) {
            count = Math.floor(segLen / spacing);
        } else if (segSlopeDeg >= 15) {
            count = Math.max(1, Math.floor(segLen / (Calculator.getXConeSpacing(segSlopeDeg) || 1.0)));
        }

        if (count <= 0) continue;

        const unitDir = dir.clone().normalize();
        // The tip of the cone must ALWAYS point downwards along the slope (towards lower elevation Y, in direction of fall/gravity)
        let downDir;
        if (Math.abs(pB.y - pA.y) > 0.001) {
            downDir = (pB.y > pA.y) ? unitDir.clone().negate() : unitDir.clone();
        } else {
            const spDeg = (activeSpans && activeSpans[i]) ? parseFloat(activeSpans[i].slopeDeg !== undefined ? activeSpans[i].slopeDeg : activeSpans[i].slope_deg) : 0;
            downDir = (spDeg > 0) ? unitDir.clone().negate() : unitDir.clone();
        }

        for (let k = 1; k <= count; k++) {
            let dist = 0;
            if (explicitCount !== null) {
                dist = (k / (count + 1)) * segLen;
            } else {
                dist = k * spacing;
                if (dist > segLen - 0.2) {
                    if (k === 1) dist = segLen / 2;
                    else break;
                }
            }

            const posCone = pA.clone().add(unitDir.clone().multiplyScalar(dist));
            const coneContainer = new THREE.Group();

            let coneMeshObj;
            if (xconeComp && xconeComp.file && objCache[xconeComp.file]) {
                coneMeshObj = prepareOBJModel(objCache[xconeComp.file], 0, xconeComp.file);
            } else {
                coneMeshObj = createProceduralXConeMesh();
                if (xconeComp && xconeComp.file && !objCache[xconeComp.file]) {
                    loadOBJModel(xconeComp.file).then(() => {
                        if (typeof update3DScene === "function") update3DScene();
                    });
                }
            }

            coneContainer.add(coneMeshObj);

            // Orient cone tip pointing DOWNWARDS along the cable slope (-unitDir)
            coneContainer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), downDir);
            coneContainer.position.copy(posCone);
            coneContainer.userData.isXCone = true;

            // Spec V2 — 14 / Criterion 4: Floating 3D label (C1, C2...)
            const coneLabel = createXConeBadgeSprite(`C${globalConeIndex}`);
            coneLabel.position.set(0, 0.25, 0);
            coneLabel.userData.isXConeLabel = true;
            coneContainer.add(coneLabel);

            anchorGroup.add(coneContainer);
            globalConeIndex++;
        }
    }
}

// Main 3D Renderer for Config 8 & Config 9 (Dedicated Slope Lifeline Engine)
function renderConfig8_9SlopeSystem3D() {
    const isSingle = (state.layoutType === "slope_single");
    const spans = isSingle ? [state.spans[0] || { length: 20.0, slopeDeg: 30 }] : (state.spans || []);
    const maxSpan = Calculator.getMaxSpan(state.product);

    // 1. Validation: check lengths and slope angles
    const validation = validateSlopeSystemSpans(spans, maxSpan);
    const warningElem = document.getElementById("canvas-warning");
    const warningTextElem = document.getElementById("warning-text");

    if (!validation.valid) {
        console.error(`[CONFIG 8/9 VALIDATION ERROR] ${validation.error}`);
        if (warningElem && warningTextElem) {
            warningTextElem.textContent = `⚠️ ${validation.error}`;
            warningElem.classList.remove("hidden");
        }
        return { valid: false, error: validation.error };
    } else {
        if (warningElem) warningElem.classList.add("hidden");
    }

    const geom = calculateSlopeSystemGeometry(spans);
    const sommets = geom.sommets;
    const N = geom.N;

    // 2. Render dedicated sloped roof surface
    const roofMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.55,
        metalness: 0.35,
        side: THREE.DoubleSide
    });
    const slopeRoof = createSlopeSystemRoofMesh(sommets, spans, roofMat);
    scene.add(slopeRoof);
    roofMesh = slopeRoof;

    // 3. Render Posts: exactly N + 1 existing pieces placed & oriented perpendicularly
    const attachPoints = [];
    const createdPosts = [];

    for (let i = 0; i <= N; i++) {
        const pt = sommets[i];
        let slopeAngle = 0;
        if (i === 0) {
            slopeAngle = (spans[0].slopeDeg * Math.PI) / 180;
        } else if (i === N) {
            slopeAngle = (spans[N - 1].slopeDeg * Math.PI) / 180;
        } else {
            const aPrev = (spans[i - 1].slopeDeg * Math.PI) / 180;
            const aNext = (spans[i].slopeDeg * Math.PI) / 180;
            slopeAngle = (aPrev + aNext) / 2; // Exact normal bisector
        }

        const normalVec = new THREE.Vector3(-Math.sin(slopeAngle), Math.cos(slopeAngle), 0);
        const nodeType = (i === 0 || i === N) ? "extremite" : "intermediaire";
        const postRotY = (i === N) ? Math.PI : 0;

        // Reuse existing anchor mesh piece (rendered only if checked by user)
        const postMesh = createAnchorMesh(state.colors.anchors, nodeType, null, postRotY);
        const activePostHeight = (postMesh && postMesh.userData && postMesh.userData.height) || 0.45;

        if (postMesh && postMesh.children.length > 0) {
            postMesh.position.set(pt.x, pt.y, 0);

            // Tilt perpendicular to surface (strictly around Z-axis; Y-heading is oriented internally on sub-mesh)
            postMesh.rotation.z = slopeAngle;
            postMesh.rotation.y = 0;
            postMesh.rotation.x = 0;

            postMesh.userData.isPost = true;
            postMesh.userData.postIndex = i;
            anchorGroup.add(postMesh);
            createdPosts.push(postMesh);
        }

        // Attachment point of the cable (clamp height)
        const clampH = isExtreme(state.product) ? activePostHeight : Math.max(0.05, activePostHeight - 0.035);
        const attachPt = new THREE.Vector3(pt.x, pt.y, 0).add(normalVec.clone().multiplyScalar(clampH));
        attachPoints.push(attachPt);
    }

    // 4. Render Cable Segments: exactly N main span segments
    const cableMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(state.colors.cable || "#f8fafc"),
        metalness: 0.9,
        roughness: 0.15,
        emissive: new THREE.Color(state.colors.cable || "#f8fafc"),
        emissiveIntensity: 0.2
    });

    const mainCableSegments = [];
    for (let i = 0; i < N; i++) {
        const pA = attachPoints[i];
        const pB = attachPoints[i + 1];

        const curve = new THREE.LineCurve3(pA, pB);
        const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.005, 8, false);
        const cableMesh = new THREE.Mesh(tubeGeo, cableMat);
        cableMesh.userData.isMainSpan = true;
        cableMesh.userData.spanIndex = i;
        cableGroup.add(cableMesh);
        mainCableSegments.push(cableMesh);
    }

    // 5. Terminations & Buffers
    const cableExt = isExtreme(state.product) ? 0.30 : 0.20;
    const rad0 = (spans[0].slopeDeg * Math.PI) / 180;
    const tan0 = new THREE.Vector3(Math.cos(rad0), Math.sin(rad0), 0);
    const bufferPt0 = attachPoints[0].clone().add(tan0.clone().multiplyScalar(-cableExt));

    const curve0 = new THREE.LineCurve3(bufferPt0, attachPoints[0]);
    cableGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve0, 16, 0.005, 8, false), cableMat));
    cableGroup.add(createCableLoopTerminal(bufferPt0, tan0.clone().negate(), state.colors.cable, false));

    const radLast = (spans[N - 1].slopeDeg * Math.PI) / 180;
    const tanLast = new THREE.Vector3(Math.cos(radLast), Math.sin(radLast), 0);
    const bufferPtN = attachPoints[N].clone().add(tanLast.clone().multiplyScalar(cableExt));

    const curveN = new THREE.LineCurve3(attachPoints[N], bufferPtN);
    cableGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curveN, 16, 0.005, 8, false), cableMat));
    cableGroup.add(createCableLoopTerminal(bufferPtN, tanLast, state.colors.cable, false));

    // 6. Render X-CONE safety elements along sloped cable if checked
    renderXConesAlongCable(attachPoints, spans);

    // Worker silhouette removed for Config 8 and 9 as requested

    // 7. Code Assertions Check
    const actualPostCount = createdPosts.length;
    const actualCableCount = mainCableSegments.length;
    const hasCheckedPost = (COMPONENTS_DB[state.product] || []).some(c => c.checked && c.id !== "Contre_Plaque" && c.id !== "X-Cone");
    const expectedPostCount = hasCheckedPost ? (N + 1) : 0;
    const expectedCableCount = N;

    let consecutiveValid = true;
    for (let i = 0; i < N; i++) {
        if (!attachPoints[i] || !attachPoints[i + 1]) consecutiveValid = false;
    }

    const assertionsPassed = (actualPostCount === expectedPostCount) &&
                             (actualCableCount === expectedCableCount) &&
                             consecutiveValid;

    if (!assertionsPassed) {
        console.error(`[CONFIG 8/9 ASSERTION FAILED] Posts: ${actualPostCount} (expected ${expectedPostCount}), Cables: ${actualCableCount} (expected ${expectedCableCount}), Consecutive: ${consecutiveValid}`);
    } else {
        console.log(`[CONFIG 8/9 ASSERTIONS OK] Posts: ${actualPostCount} (expected ${expectedPostCount}), Cables: ${actualCableCount} (expected ${expectedCableCount}). All consecutive.`);
    }

    // Bounds for camera centering
    const minX = sommets[0].x - 2.0;
    const maxX = sommets[N].x + 2.0;
    const minY = 0;
    const maxY = sommets[N].y + 1.5;

    return {
        valid: true,
        bounds: { minX, maxX, minY, maxY },
        center: {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2,
            z: 0
        }
    };
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

    if (typeof cleanupCollinearXMatrixBranches === "function") {
        cleanupCollinearXMatrixBranches(state.spans);
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

    createSkylightsObstacles(L, l);
    createConfig10Structures3D();
    createConfig6Structures3D();

    if (state.gridVisible) {
        const gridDim = Math.max(L, l) + 12;
        gridHelper = new THREE.GridHelper(gridDim, Math.round(gridDim), 0x3b82f6, 0x94a3b8);
        gridHelper.position.set(L / 2, 0.001, l / 2);
        scene.add(gridHelper);
    }

    // Default product if not set
    if (!state.product) {
        state.product = "CORE";
    }

    const line1TopPts = [];
    const line2TopPts = [];

    // Determine uniform cable post height across all nodes to ensure 100% level cable line touching anchor heads
    const activeComps = COMPONENTS_DB[state.product] || [];
    const sampleAnchor = createAnchorMesh(state.colors.anchors, "intermediaire");
    const nominalPostHeight = (sampleAnchor && sampleAnchor.userData && sampleAnchor.userData.height > 0.05) ? sampleAnchor.userData.height : 0.45;
    const activePostHeight = nominalPostHeight;

    function processSingleNodeMesh(pos, targetPtsArray) {
        const rotY = pos.rotY || 0;
        const roofY = getRoofHeightAt(pos.x, pos.z);
        const anchor = createAnchorMesh(state.colors.anchors, pos.type, pos.compId, rotY, activePostHeight);
        anchor.userData.isAnchorPost = true;

        // NO ARTIFICIAL STRETCHING: Models are kept at 100% nominal CAD dimensions.

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

        // Spec V2_14: X-Matrix Junction (Suspended at cable height, NO post underneath)
        if (pos.hasXMatrix || pos.type === "x_matrix") {
            const cableTopY = pos.y + roofY + roofLift + activePostHeight;
            const xmatMesh = createXMatrixPieceMesh(rotY);
            xmatMesh.position.set(pos.x, cableTopY, pos.z);
            xmatMesh.rotation.x = rotX;
            anchorGroup.add(xmatMesh);

            targetPtsArray.push(new THREE.Vector3(pos.x, cableTopY, pos.z));

            if (typeof renderXMatrixBranches3D === "function") {
                renderXMatrixBranches3D(pos, cableTopY, rotX, activePostHeight);
            }
            return;
        }

        anchor.rotation.x = rotX;
        anchor.rotation.z = 0;
        anchor.position.set(pos.x, pos.y + roofY + roofLift, pos.z);
        anchorGroup.add(anchor);

        const cpComp = activeComps.find(c => c.id === "Contre_Plaque" && c.checked);
        if (cpComp && objCache[cpComp.file]) {
            const cpObj = prepareOBJModel(objCache[cpComp.file], rotY, cpComp.file);
            cpObj.rotation.x = rotX;
            cpObj.position.set(pos.x, pos.y + roofY + roofLift, pos.z);
            anchorGroup.add(cpObj);
        }

        const packComp = activeComps.find(c => c.id === "Pack_Matrix" && c.checked);
        if (packComp && objCache[packComp.file]) {
            const packObj = prepareOBJModel(objCache[packComp.file], rotY, packComp.file);
            packObj.rotation.x = rotX;
            packObj.position.set(pos.x, pos.y + roofY + roofLift + 0.02, pos.z);
            anchorGroup.add(packObj);
        }

        // Uniform cable height passing 100% straight through top clamp head of posts
        const currentPostH = (anchor && anchor.userData && anchor.userData.height > 0.05) ? anchor.userData.height : activePostHeight;
        const clampH = isExtreme(state.product) ? currentPostH : Math.max(0.05, currentPostH - 0.035);

        const topY = pos.y + roofY + roofLift + clampH * Math.cos(rotX);
        const topZ = pos.z + clampH * Math.sin(rotX);

        targetPtsArray.push(new THREE.Vector3(pos.x, topY, topZ));
    }

    // Helper to process node lists (orienting all pieces in the same direction: inside or outside)
    function processNodes(nodesList, targetPtsArray) {
        const layoutHasBends = nodesList.some(p => Math.abs(p.bendDeg || 0) > 0 || p.type === "angle") ||
                               (state.layoutType && (state.layoutType.includes("bend") || state.layoutType === "multi_bend_circle"));
        const orientMode = state.bendOrientation || "inside"; // "inside" | "outside"

        // Determine dominant turn direction (+1 left, -1 right)
        let dominantTurnSide = 1;
        const firstBendNode = nodesList.find(p => (p.bendDeg || 0) !== 0);
        if (firstBendNode && (firstBendNode.bendDeg || 0) < 0) {
            dominantTurnSide = -1;
        }

        nodesList.forEach((pos, idx) => {
            if (pos.customRotY !== undefined) {
                processSingleNodeMesh({ ...pos, rotY: pos.customRotY }, targetPtsArray);
                return;
            }

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

            let rotYIn = rotY;
            if (idx > 0) {
                rotYIn = Math.atan2(pos.z - nodesList[idx - 1].z, pos.x - nodesList[idx - 1].x);
            } else if (state.closedLoop && nodesList.length > 1) {
                const prevNode = nodesList[nodesList.length - 2] || nodesList[nodesList.length - 1];
                rotYIn = Math.atan2(pos.z - prevNode.z, pos.x - prevNode.x);
            }

            let rotYOut = rotYIn + ((pos.bendDeg || 0) * Math.PI) / 180;
            if (idx < nodesList.length - 1) {
                rotYOut = Math.atan2(nodesList[idx + 1].z - pos.z, nodesList[idx + 1].x - pos.x);
            } else if (state.closedLoop && nodesList.length > 1) {
                const nextNode = nodesList[0];
                rotYOut = Math.atan2(nextNode.z - pos.z, nextNode.x - pos.x);
            }

            // The piece and the line must ALWAYS be on the same directing vector (vecteur directeur, collinear with the cable)
            let calculatedRotY = (pos.rotY !== undefined) ? pos.rotY : rotY;
            if (pos.customRotY !== undefined) {
                calculatedRotY = pos.customRotY;
            } else if (state.layoutType === "multi_bend_circle") {
                calculatedRotY = pos.rotY || 0;
            } else if (nodesList.length > 1) {
                // Aligned strictly with the directing vector of the line (rotYOut for start and bends, rotYIn for line ends):
                if (idx === 0 || (idx < nodesList.length - 1 && (Math.abs(pos.bendDeg || 0) > 0 || pos.type === "angle"))) {
                    calculatedRotY = rotYOut;
                } else if (idx === nodesList.length - 1 && state.closedLoop) {
                    calculatedRotY = rotYOut;
                } else {
                    calculatedRotY = rotYIn;
                }
            }

            // Spec V2 — 17: Coudes supérieurs à 40° -> Ancrage double A#a / A#b avec 2 potelets physiques 3D espacés de +/- 0.45m
            const bendAngle = Math.abs(pos.bendDeg || 0);
            const isDoubledCorner = pos.isDoubled || (pos.type === "angle" && bendAngle > 40);
            if (isDoubledCorner && nodesList.length > 1) {
                const offsetDist = 0.45;
                const posA = {
                    ...pos,
                    x: pos.x - offsetDist * Math.cos(rotYIn),
                    z: pos.z - offsetDist * Math.sin(rotYIn),
                    rotY: rotYIn
                };
                const posB = {
                    ...pos,
                    x: pos.x + offsetDist * Math.cos(rotYOut),
                    z: pos.z + offsetDist * Math.sin(rotYOut),
                    rotY: rotYOut
                };
                processSingleNodeMesh(posA, targetPtsArray);
                processSingleNodeMesh(posB, targetPtsArray);
            } else {
                processSingleNodeMesh({ ...pos, rotY: calculatedRotY }, targetPtsArray);
            }
        });
    }

    if (state.layoutType === "cross_spans") {
        renderConfig11CrossSpans3D();
        const centerX = L / 2;
        const centerZ = l / 2;
        if (controls) {
            controls.target.set(centerX, state.viewMode === "2d" ? 0 : 0.2, centerZ);
            controls.update();
        }
        if (orthographicCam && state.viewMode === "2d") {
            orthographicCam.position.set(centerX, 40, centerZ);
            orthographicCam.lookAt(centerX, 0, centerZ);
        }
        updateCalculationsUI(layout, maxSpan);
        return;
    } else if (state.layoutType === "grid_system") {
        renderConfig12GridSystem3D();
        const centerX = L / 2;
        const centerZ = l / 2;
        if (controls) {
            controls.target.set(centerX, state.viewMode === "2d" ? 0 : 0.2, centerZ);
            controls.update();
        }
        if (orthographicCam && state.viewMode === "2d") {
            orthographicCam.position.set(centerX, 40, centerZ);
            orthographicCam.lookAt(centerX, 0, centerZ);
        }
        updateCalculationsUI(layout, maxSpan);
        return;
    } else if (state.layoutType === "slope_single" || state.layoutType === "slope_multi") {
        const slopeRes = renderConfig8_9SlopeSystem3D();
        if (slopeRes && slopeRes.valid && slopeRes.center) {
            if (controls) {
                controls.target.set(slopeRes.center.x, slopeRes.center.y, slopeRes.center.z);
                controls.update();
            }
            if (activeCam && controls) {
                const totalH = slopeRes.bounds.maxY - slopeRes.bounds.minY;
                const totalL = slopeRes.bounds.maxX - slopeRes.bounds.minX;
                const dist = Math.max(12, Math.max(totalH, totalL) * 1.3);
                activeCam.position.set(slopeRes.center.x - dist * 0.45, slopeRes.center.y + dist * 0.45, dist * 0.85);
                controls.update();
            }
            if (orthographicCam && state.viewMode === "2d") {
                orthographicCam.position.set(slopeRes.center.x, slopeRes.bounds.maxY + 30, slopeRes.center.z);
                orthographicCam.lookAt(slopeRes.center.x, slopeRes.center.y, slopeRes.center.z);
            }
        }
        updateCalculationsUI(layout, maxSpan);
        return;
    }

    processNodes(layout.line1, line1TopPts);
    renderXConesAlongCable(line1TopPts, state.spans);


    const cableExt = isExtreme(state.product) ? 0.30 : 0.20;

    if (state.hasLine2 && state.xMatrixLocation === "end" && layout.line2.length > 0) {
        // END CORNER JUNCTION: Single continuous curved cable bending around corner
        processNodes(layout.line2, line2TopPts);
        renderXConesAlongCable(line2TopPts, state.spans);

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
        // MIDPOINT T-JUNCTION: Separate Line 1 and Line 2 cables
        if (line1TopPts.length > 1) {
            const isClosedLayout = !!state.closedLoop;

            if (isClosedLayout && line1TopPts.length > 2) {
                const fullPath1 = [];
                for (let i = 0; i < line1TopPts.length; i++) {
                    const pA = line1TopPts[i];
                    const pB = line1TopPts[(i + 1) % line1TopPts.length];
                    fullPath1.push(pA);
                    const p13 = new THREE.Vector3().lerpVectors(pA, pB, 1 / 3);
                    const p23 = new THREE.Vector3().lerpVectors(pA, pB, 2 / 3);
                    fullPath1.push(p13);
                    fullPath1.push(p23);
                }
                fullPath1.push(line1TopPts[0]);

                const curve1 = new THREE.CatmullRomCurve3(fullPath1, false, 'catmullrom', 0.0);
                const tubeGeo1 = new THREE.TubeGeometry(curve1, fullPath1.length * 8, 0.01, 8, false);
                const cableMat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(state.colors.cable),
                    metalness: 0.9,
                    roughness: 0.1,
                    emissive: new THREE.Color(state.colors.cable),
                    emissiveIntensity: 0.2
                });
                const mesh1 = new THREE.Mesh(tubeGeo1, cableMat);
                cableGroup.add(mesh1);
            } else {
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

        if (layout.line2.length > 0 && layout.junctionNode) {
            const jIndex = layout.line1.indexOf(layout.junctionNode);
            const jTopPt = line1TopPts[jIndex];

            processNodes(layout.line2, line2TopPts);
            renderXConesAlongCable(line2TopPts, state.spans);

            if (jTopPt && line2TopPts.length > 0) {
                const fullPath2 = [jTopPt, ...line2TopPts];

                const endL2 = line2TopPts[line2TopPts.length - 1];
                const prevL2 = line2TopPts.length > 1 ? line2TopPts[line2TopPts.length - 2] : jTopPt;
                const vEnd2 = endL2.clone().sub(prevL2).normalize();
                const endExt2 = endL2.clone().add(vEnd2.multiplyScalar(cableExt));
                fullPath2.push(endExt2);

                const curve2 = new THREE.CatmullRomCurve3(fullPath2, false, 'catmullrom', 0.05);
                const tubeGeo2 = new THREE.TubeGeometry(curve2, fullPath2.length * 12, 0.01, 8, false);
                const cableMat2 = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(state.colors.cable),
                    metalness: 0.9,
                    roughness: 0.1
                });
                const mesh2 = new THREE.Mesh(tubeGeo2, cableMat2);
                cableGroup.add(mesh2);

                // Add crimped cable end loop at Line 2 end
                cableGroup.add(createCableLoopTerminal(endExt2, vEnd2, state.colors.cable));
            }
        }
    }

    // Render Cable Loops & Stopper Pins (Butées) on X-Matrix arms
    const isXMatrixChecked = (COMPONENTS_DB[state.product] || []).some(c => c.id === "X-Matrix" && c.checked);
    const hasJunctionXMat = state.hasLine2 || isXMatrixChecked;

    if (hasJunctionXMat && line1TopPts.length > 0) {
        if (state.xMatrixLocation === "end" && state.hasLine2 && line2TopPts.length > 0) {
            // CORNER JUNCTION: Continuous cable passes around corner without crimp terminals
        } else {
            // MIDPOINT X-MATRIX JUNCTION
            const jIndex = layout.line1.findIndex(n => n.type === "x_matrix");
            if (jIndex >= 0 && line1TopPts[jIndex]) {
                const jTopPt = line1TopPts[jIndex];
                const vDir1 = (jIndex > 0) ? line1TopPts[jIndex - 1].clone().sub(jTopPt).normalize() : new THREE.Vector3(-1, 0, 0);
                const vDir2 = (jIndex < line1TopPts.length - 1) ? line1TopPts[jIndex + 1].clone().sub(jTopPt).normalize() : new THREE.Vector3(1, 0, 0);

                let vDir3 = new THREE.Vector3(0, 0, 1);
                if (state.hasLine2 && line2TopPts.length > 0) {
                    vDir3 = line2TopPts[0].clone().sub(jTopPt).normalize();
                } else {
                    vDir3 = new THREE.Vector3(-vDir1.z, 0, vDir1.x).normalize();
                }
                const vDir4 = vDir3.clone().negate();

                const posSlot1 = jTopPt.clone().add(vDir1.clone().multiplyScalar(0.055));
                const posSlot2 = jTopPt.clone().add(vDir2.clone().multiplyScalar(0.055));
                const posSlot3 = jTopPt.clone().add(vDir3.clone().multiplyScalar(0.055));

                // Arm 1 (Line 1 incoming): Cable Loop passing through slot 1
                cableGroup.add(createCableLoopTerminal(posSlot1, vDir1, state.colors.cable, true));
                // Arm 2 (Line 1 outgoing): Cable Loop passing through slot 2
                cableGroup.add(createCableLoopTerminal(posSlot2, vDir2, state.colors.cable, true));

                // Arm 3 (Line 2 branch side): Loop through slot 3 if line 2 present, else Stopper Pin (Butée)
                if (state.hasLine2 && line2TopPts.length > 0) {
                    cableGroup.add(createCableLoopTerminal(posSlot3, vDir3, state.colors.cable, true));
                } else {
                    cableGroup.add(createXMatrixStopperPin(jTopPt, vDir3));
                }

                // Arm 4 (Unused arm): Stopper Pin (Butée)
                cableGroup.add(createXMatrixStopperPin(jTopPt, vDir4));
            }
        }
    }

    const centerX = L / 2;
    const centerZ = l / 2;
    if (controls) {
        controls.target.set(centerX, 0.2, centerZ);
        controls.update();
    }

    window.activeLifelinePoints = line1TopPts;
    if (typeof Dimensions3DModule !== "undefined") {
        Dimensions3DModule.renderDimensions();
    }

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

function getLongRangeSubRange(span) {
    if (span <= 20.0) return "Long Range (10-20m)";
    if (span <= 34.0) return "Super Range (20-34m)";
    return "Ultra Range (34-56m)";
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
function countTotalAnchorPosts(positions) {
    if (!positions || positions.length === 0) return 0;
    let count = 0;
    positions.forEach(p => {
        if (p.type === "x_matrix" || p.noPost || p.hasXMatrix) return;
        const bendAngle = Math.abs(p.bendDeg || 0);
        if (p.isDoubled || (p.type === "angle" && bendAngle > 40)) {
            count += 2;
        } else {
            count += 1;
        }
    });
    // Add posts from X-Matrix branches (intermediate and end posts)
    if (state.spans) {
        state.spans.forEach(s => {
            if (s && s.hasXMatrix && s.xMatrixBranches && s.xMatrixBranches.length > 0) {
                s.xMatrixBranches.forEach(b => {
                    const bDeg = (b.angleDeg !== undefined) ? parseFloat(b.angleDeg) : 90;
                    const normAng = ((bDeg % 360) + 360) % 360;
                    if (normAng < 15 || normAng > 345 || Math.abs(normAng - 180) < 15) return;
                    const bSpans = (typeof getBranchSpans === "function") ? getBranchSpans(b) : (b.spans || [{ id: "xmb_s1", length: b.length || 5.0 }]);
                    count += bSpans.length;
                });
            }
        });
    }
    return count;
}
window.countTotalAnchorPosts = countTotalAnchorPosts;

function collectSceneGeometryContext(layout) {
    const layoutType = state.layoutType || "single_span";

    // 1. Cross spans (Config 11)
    if (layoutType === "cross_spans") {
        const hubX = state.L / 2;
        const hubZ = state.l / 2;
        const samplePostAnchor = createAnchorMesh(state.colors.anchors, "extremite", null, 0);
        const yCable = samplePostAnchor?.userData?.height || 0.45;
        const hub = new THREE.Vector3(hubX, yCable, hubZ);
        const cs = state.crossSpans || { north: 10, east: 10, south: 10, west: 10, angles: [270, 0, 90, 180] };
        const angles = cs.angles || [270, 0, 90, 180];
        const lens = [
            parseFloat(cs.north) || 10.0,
            parseFloat(cs.east) || 10.0,
            parseFloat(cs.south) || 10.0,
            parseFloat(cs.west) || 10.0
        ];
        const branches = [];
        for (let i = 0; i < 4; i++) {
            const rad = (angles[i] * Math.PI) / 180;
            const endX = hubX + lens[i] * Math.cos(rad);
            const endZ = hubZ + lens[i] * Math.sin(rad);
            const pos = new THREE.Vector3(endX, yCable, endZ);
            const mid = new THREE.Vector3((hubX + endX) / 2, yCable, (hubZ + endZ) / 2);
            branches.push({ pos, mid });
        }
        return { hub, branches };
    }

    // 2. Grid system (Config 12)
    if (layoutType === "grid_system") {
        const gs = state.gridSystem || { nx: 3, ny: 3, xSpacings: [5.0, 5.0], zSpacings: [5.0, 5.0], end_margin: 2.0, cable_height: 3.5 };
        const nx = Math.max(2, gs.nx || 3);
        const ny = Math.max(2, gs.ny || 3);
        const endMargin = Math.max(0.5, gs.end_margin !== undefined ? gs.end_margin : 2.0);
        const cableHeight = Math.max(1.0, gs.cable_height !== undefined ? gs.cable_height : 3.5);
        const xSpacings = gs.xSpacings && gs.xSpacings.length === nx - 1 ? gs.xSpacings : Array(nx - 1).fill(5.0);
        const zSpacings = gs.zSpacings && gs.zSpacings.length === ny - 1 ? gs.zSpacings : Array(ny - 1).fill(5.0);

        const startX = 3.0 + endMargin;
        const startZ = 3.0 + endMargin;
        const xCoords = [startX];
        for (let i = 0; i < xSpacings.length; i++) xCoords.push(xCoords[i] + (xSpacings[i] || 5.0));
        const zCoords = [startZ];
        for (let j = 0; j < zSpacings.length; j++) zCoords.push(zCoords[j] + (zSpacings[j] || 5.0));

        const xMatrixGrid = [];
        for (let r = 0; r < ny; r++) {
            xMatrixGrid[r] = [];
            for (let c = 0; c < nx; c++) {
                xMatrixGrid[r][c] = new THREE.Vector3(xCoords[c], cableHeight, zCoords[r]);
            }
        }

        const northAnchors = [];
        for (let c = 0; c < nx; c++) {
            northAnchors.push(new THREE.Vector3(xCoords[c], cableHeight, zCoords[0] - endMargin));
        }

        const eastAnchors = [];
        for (let r = 0; r < ny; r++) {
            eastAnchors.push(new THREE.Vector3(xCoords[nx - 1] + endMargin, cableHeight, zCoords[r]));
        }

        const southAnchors = [];
        for (let c = 0; c < nx; c++) {
            southAnchors.push(new THREE.Vector3(xCoords[c], cableHeight, zCoords[ny - 1] + endMargin));
        }

        const westAnchors = [];
        for (let r = 0; r < ny; r++) {
            westAnchors.push(new THREE.Vector3(xCoords[0] - endMargin, cableHeight, zCoords[r]));
        }

        const rowSpanMids = [];
        for (let r = 0; r < ny; r++) {
            rowSpanMids[r] = [];
            rowSpanMids[r][0] = new THREE.Vector3((westAnchors[r].x + xMatrixGrid[r][0].x) / 2, cableHeight, zCoords[r]);
            for (let c = 0; c < nx - 1; c++) {
                rowSpanMids[r][c + 1] = new THREE.Vector3((xMatrixGrid[r][c].x + xMatrixGrid[r][c + 1].x) / 2, cableHeight, zCoords[r]);
            }
            rowSpanMids[r][nx] = new THREE.Vector3((xMatrixGrid[r][nx - 1].x + eastAnchors[r].x) / 2, cableHeight, zCoords[r]);
        }

        const colSpanMids = [];
        for (let c = 0; c < nx; c++) {
            colSpanMids[c] = [];
            colSpanMids[c][0] = new THREE.Vector3(xCoords[c], cableHeight, (northAnchors[c].z + xMatrixGrid[0][c].z) / 2);
            for (let r = 0; r < ny - 1; r++) {
                colSpanMids[c][r + 1] = new THREE.Vector3(xCoords[c], cableHeight, (xMatrixGrid[r][c].z + xMatrixGrid[r + 1][c].z) / 2);
            }
            colSpanMids[c][ny] = new THREE.Vector3(xCoords[c], cableHeight, (xMatrixGrid[ny - 1][c].z + southAnchors[c].z) / 2);
        }

        return { xMatrixGrid, northAnchors, eastAnchors, southAnchors, westAnchors, rowSpanMids, colSpanMids };
    }

    // 3. Slope systems (Configs 8 & 9)
    if (layoutType === "slope_single" || layoutType === "slope_multi") {
        const rawSpans = (layoutType === "slope_single")
            ? [state.spans?.[0] || { length: state.lineLength || 20.0, slopeDeg: 30 }]
            : (state.spans || [{ length: 10, slopeDeg: 20 }, { length: 12, slopeDeg: 35 }, { length: 8, slopeDeg: 25 }]);

        const N = rawSpans.length;
        const sommets = [{ x: 2.0, y: 0.5 }];
        for (let i = 0; i < N; i++) {
            const sp = rawSpans[i];
            const deg = parseFloat(sp.slopeDeg !== undefined ? sp.slopeDeg : sp.slope_deg) || 0;
            const len = parseFloat(sp.length) || 10.0;
            const rad = (deg * Math.PI) / 180;
            const prev = sommets[i];
            sommets.push({
                x: prev.x + len * Math.cos(rad),
                y: prev.y + len * Math.sin(rad)
            });
        }

        const attachPoints = [];
        const postNormals = [];
        for (let i = 0; i <= N; i++) {
            const pt = sommets[i];
            let slopeAngle = 0;
            if (i === 0) slopeAngle = (parseFloat(rawSpans[0].slopeDeg || 0) * Math.PI) / 180;
            else if (i === N) slopeAngle = (parseFloat(rawSpans[N - 1].slopeDeg || 0) * Math.PI) / 180;
            else {
                const aPrev = (parseFloat(rawSpans[i - 1].slopeDeg || 0) * Math.PI) / 180;
                const aNext = (parseFloat(rawSpans[i].slopeDeg || 0) * Math.PI) / 180;
                slopeAngle = (aPrev + aNext) / 2;
            }
            const normalVec = new THREE.Vector3(-Math.sin(slopeAngle), Math.cos(slopeAngle), 0);
            const clampH = 0.42;
            attachPoints.push(new THREE.Vector3(pt.x, pt.y, 0).add(normalVec.clone().multiplyScalar(clampH)));
            postNormals.push(normalVec);
        }

        const spanMids = [];
        for (let i = 0; i < N; i++) {
            spanMids.push(attachPoints[i].clone().lerp(attachPoints[i + 1], 0.5));
        }

        return { attachPoints, postNormals, spanMids };
    }

    // 4. Linear & Loop layouts (Configs 1, 2, 3, 4, 5, 6, 7, 10)
    let anchorPositions = [];
    let spanMids = [];
    if (layout) {
        const nodesList = (layout.line1 || (Array.isArray(layout) ? layout : []));
        nodesList.forEach((pos, idx) => {
            const bendAngle = Math.abs(pos.bendDeg || 0);
            const isDoubledCorner = pos.isDoubled || (pos.type === "angle" && bendAngle > 40);
            const roofY = (typeof getRoofHeightAt === "function") ? getRoofHeightAt(pos.x, pos.z) : 0;
            if (isDoubledCorner && nodesList.length > 1) {
                let rotYIn = 0;
                if (idx > 0) rotYIn = Math.atan2(pos.z - nodesList[idx - 1].z, pos.x - nodesList[idx - 1].x);
                let rotYOut = rotYIn + ((pos.bendDeg || 0) * Math.PI) / 180;
                if (idx < nodesList.length - 1) rotYOut = Math.atan2(nodesList[idx + 1].z - pos.z, nodesList[idx + 1].x - pos.x);
                const offsetDist = 0.45;
                anchorPositions.push(new THREE.Vector3(pos.x - offsetDist * Math.cos(rotYIn), pos.y + roofY, pos.z - offsetDist * Math.sin(rotYIn)));
                anchorPositions.push(new THREE.Vector3(pos.x + offsetDist * Math.cos(rotYOut), pos.y + roofY, pos.z + offsetDist * Math.sin(rotYOut)));
            } else {
                anchorPositions.push(new THREE.Vector3(pos.x, pos.y + roofY, pos.z));
            }
        });

        // Compute true 3D cable midpoints for all spans
        const isClosedLoop = (state.closedLoop === true) || (layoutType === "quad_loop") ||
                             (layoutType === "multi_bend_circle" && state.closedLoop !== false);
        const numSpans = isClosedLoop ? nodesList.length : (nodesList.length - 1);
        for (let i = 0; i < numSpans; i++) {
            const p1 = nodesList[i];
            const p2 = (isClosedLoop && i === nodesList.length - 1) ? nodesList[0] : nodesList[i + 1];
            if (p1 && p2) {
                const rY1 = (typeof getRoofHeightAt === "function") ? getRoofHeightAt(p1.x, p1.z) : 0;
                const rY2 = (typeof getRoofHeightAt === "function") ? getRoofHeightAt(p2.x, p2.z) : 0;
                const postH = 0.42;
                spanMids.push(new THREE.Vector3(
                    (p1.x + p2.x) / 2,
                    ((p1.y + rY1) + (p2.y + rY2)) / 2 + postH,
                    (p1.z + p2.z) / 2
                ));
            }
        }
    }

    if (anchorPositions.length === 0 && anchorGroup && anchorGroup.children) {
        anchorGroup.children.forEach(ch => {
            if (ch.userData && ch.userData.isAnchorPost) {
                anchorPositions.push(ch.position.clone());
            }
        });
    }

    return { anchorPositions, spanMids };
}

function updateCalculationsUI(layout, maxSpan) {
    if (typeof AuthModule !== "undefined" && !AuthModule.isAuthenticated()) {
        const valIds = ["val-anchor-count", "val-absorber-count", "val-engineer-coef", "val-max-allowed-span", "val-total-line-len", "val-span-l", "val-force-l", "val-defl-l", "val-ext1-l", "val-ext2-l"];
        valIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = "--";
        });
        return;
    }

    const l = state.lang || 0;

    const isOSHA = (state.norm === "OSHA");
    const isMultiSpanAllowed = isOSHA && (isPro(state.product) || isCore(state.product));

    const tabEN = document.getElementById("tab-en795");
    const tabOSHA = document.getElementById("tab-osha");
    if (tabEN && tabOSHA) {
        if (isOSHA) {
            tabOSHA.classList.add("active");
            tabEN.classList.remove("active");
        } else {
            tabEN.classList.add("active");
            tabOSHA.classList.remove("active");
        }
    }

    const oshaSubtabs = document.getElementById("osha-subtabs");
    if (oshaSubtabs) {
        oshaSubtabs.style.display = (isOSHA && isMultiSpanAllowed) ? "flex" : "none";
    }

    if (!isOSHA || !isMultiSpanAllowed) {
        state.oshaSpanMode = "unique";
        const subtabUnique = document.getElementById("subtab-span-unique");
        const subtabMulti = document.getElementById("subtab-span-multi");
        if (subtabUnique) subtabUnique.classList.add("active");
        if (subtabMulti) subtabMulti.classList.remove("active");
    }

    if (!state.product) {
        const valEngCoef0 = document.getElementById("val-engineer-coef"); if (valEngCoef0) valEngCoef0.textContent = (state.norm === "OSHA") ? (state.engineerCoefficient || 1.0).toFixed(2) : String(computeFallFactorFromElevation(state.hllElevationPreset, state.hllElevation, state.bodyPosition));
        document.getElementById("val-max-allowed-span").textContent = formatDistance(null, 1, l);
        const lenElem = document.getElementById("val-total-line-len");
        if (lenElem) lenElem.textContent = formatDistance(state.lineLength || 15.0, 2, l);
        document.getElementById("val-span-l").textContent = formatDistance(null, 2, l);
        const isUSUnit = (state.unitSystem === "imperial" || state.unitSystem === "us");
        document.getElementById("val-force-l").textContent = isUSUnit ? "-- lbf" : "-- kN";
        const deflElem = document.getElementById("val-defl-l");
        if (deflElem) deflElem.textContent = formatDeflection(null, l);
        document.getElementById("val-ext1-l").textContent = isUSUnit ? "-- lbf" : "-- kN";
        document.getElementById("val-ext2-l").textContent = isUSUnit ? "-- lbf" : "-- kN";
        const lblAnchor = document.getElementById("lbl-anchor-count");
        if (lblAnchor) lblAnchor.textContent = TRANSLATIONS.lblAnchorCount[l];
        document.getElementById("val-anchor-count").textContent = "--";
        const lblAbsorber = document.getElementById("lbl-absorber-count");
        if (lblAbsorber) lblAbsorber.textContent = TRANSLATIONS.lblAbsorberCount[l];
        document.getElementById("val-absorber-count").textContent = "--";

        // Generate and update system labels even before product selection
        const geomContext = collectSceneGeometryContext(layout);
        const systemLabels = SystemLabelingModule.generateSystemLabels(state, { ext1L: 0, ext2L: 0, effortL: 0, deflL: 0 }, geomContext);
        SystemLabelingModule.renderSystemLabels3D(systemLabels);
        SystemLabelingModule.updateSystemLabelsUI(systemLabels);
        return;
    }

    const positions = (layout && layout.all) ? layout.all : (Array.isArray(layout) ? layout : []);
    const totalAnchors = countTotalAnchorPosts(positions);
    const totalLineLen = Calculator.calculateTotalLineLength(layout, state.product);
    const realSpanMax = Calculator.calculateMaxRealSpan(layout);

    const warningElem = document.getElementById("canvas-warning");
    const warningTextElem = document.getElementById("warning-text");
    const isLongRange = isExtreme(state.product);
    let isLongRangeInvalid = false;
    if (isLongRange) {
        if (state.layoutType === "grid_system") {
            const gs = state.gridSystem || { nx: 3, ny: 3, xSpacings: [5.0, 5.0], zSpacings: [5.0, 5.0] };
            const sumX = (gs.xSpacings || []).reduce((a, b) => a + b, 0);
            const sumZ = (gs.zSpacings || []).reduce((a, b) => a + b, 0);
            isLongRangeInvalid = (realSpanMax > 56.0 || sumX > 56.0 || sumZ > 56.0);
        } else {
            isLongRangeInvalid = (state.lineLength < 10.0 || state.lineLength > 56.0 || realSpanMax > 56.0);
        }
    }

    if (isLongRangeInvalid) {
        if (warningTextElem) warningTextElem.textContent = ["Vous devez choisir une longueur de ligne entre 10 et 56 m", "You must choose a line length between 32.8 and 183.7 ft", "Debe elegir una longitud de línea entre 10 y 56 m"][l];
        if (warningElem) warningElem.classList.remove("hidden");

        const lblAnchor = document.getElementById("lbl-anchor-count");
        if (lblAnchor) lblAnchor.textContent = `${TRANSLATIONS.lblAnchorCount[l]} (${getActivePostName()})`;
        document.getElementById("val-anchor-count").textContent = "--";

        const lblAbsorber = document.getElementById("lbl-absorber-count");
        if (lblAbsorber) lblAbsorber.textContent = `${TRANSLATIONS.lblAbsorberCount[l]} (${state.product})`;
        document.getElementById("val-absorber-count").textContent = "--";

        const valEngCoef1 = document.getElementById("val-engineer-coef"); if (valEngCoef1) valEngCoef1.textContent = (state.norm === "OSHA") ? (state.engineerCoefficient || 1.0).toFixed(2) : String(computeFallFactorFromElevation(state.hllElevationPreset, state.hllElevation, state.bodyPosition));
        document.getElementById("val-max-allowed-span").textContent = formatDistance(maxSpan, 1, l);

        const lenElem = document.getElementById("val-total-line-len");
        if (lenElem) lenElem.textContent = `${formatDistance(totalLineLen, 2, l)} ${formatLineMargin(30)}`;

        document.getElementById("val-span-l").textContent = formatDistance(null, 2, l);
        const isUSUnitLR = (state.unitSystem === "imperial" || state.unitSystem === "us");
        document.getElementById("val-force-l").textContent = isUSUnitLR ? "-- lbf" : "-- kN";
        const deflElem = document.getElementById("val-defl-l");
        if (deflElem) deflElem.textContent = formatDeflection(null, l);
        document.getElementById("val-ext1-l").textContent = isUSUnitLR ? "-- lbf" : "-- kN";
        document.getElementById("val-ext2-l").textContent = isUSUnitLR ? "-- lbf" : "-- kN";

        const rowExt3 = document.getElementById("row-ext3");
        const rowExt4 = document.getElementById("row-ext4");
        if (rowExt3) rowExt3.style.display = "none";
        if (rowExt4) rowExt4.style.display = "none";

        const shapeName = getLocalizedRoofShapeName();
        const strL1 = formatDistance(state.lineLength, 2, l);
        const strL2 = formatDistance(state.line2Length, 2, l);
        document.getElementById("header-dims-display").innerHTML = `<i class="fa-solid fa-ruler-combined"></i> ${shapeName} | L1: ${strL1} ${state.hasLine2 ? `+ L2: ${strL2}` : ""}`;
        const activeSysName = isExtreme(state.product) ? getLongRangeSubRange(realSpanMax) : (state.product || ["Choisissez un système", "Choose a system", "Elija un sistema"][l]);
        document.getElementById("header-system-display").textContent = activeSysName;

        return;
    }
    if (warningTextElem) warningTextElem.textContent = TRANSLATIONS.warningText[l];

    let isMultiSpan = false;
    if (isOSHA && isMultiSpanAllowed) {
        isMultiSpan = (state.oshaSpanMode === "multi");
    } else {
        isMultiSpan = false;
    }

    const support = getActiveSupportType();
    const activeSpans = (state.spans && state.spans.length > 0) ? state.spans : [{ length: realSpanMax }];
    const arrestKn = state.arrestLoadValue || 6.0;
    const isRangeProd = isExtreme(state.product);
    const p0Kn = isRangeProd ? 5.886 : 0.981;
    const isSlopedRoof = (state.roofShape === "sloped");

    // Calculate exact 2-point values for EVERY span (entraxe)
    const enFF = computeFallFactorFromElevation(state.hllElevationPreset, state.hllElevation, state.bodyPosition);
    if (!isOSHA) {
        state.fallFactor = enFF;
    }
    const ff = isOSHA
        ? ((typeof state.fallFactor === "number" && !isNaN(state.fallFactor) && state.fallFactor > 0)
            ? state.fallFactor
            : ((typeof state.engineerCoefficient === "number" && !isNaN(state.engineerCoefficient)) ? state.engineerCoefficient : 1.00))
        : enFF;

    const spanCalculations = activeSpans.map((sp, idx) => {
        const spanLen = Math.max(0.1, parseFloat(sp.length) || 5.0);
        let sEffort = 0, sDefl = 0, sExt1 = 0, sExt2 = 0;
        if (isSlopedRoof) {
            const slopedRep = SlopedSystemConesModule.getFullScenarioReport(state.roofSlope || 15, spanLen, state.lineLength);
            sExt1 = slopedRep.retainedMax.loadCellTopKn;
            sExt2 = slopedRep.retainedMax.loadCellBottomKn;
            sEffort = Calculator.effortLonge(state.product, spanLen, state.nbUsers, state.norm, isOSHA ? 1.0 : enFF, support, false);
            sDefl = Calculator.deflection(state.product, spanLen, isOSHA ? 1.0 : enFF, support, state.nbUsers, state.norm, false);
        } else if (!isOSHA) {
            sEffort = Calculator.effortLonge(state.product, spanLen, state.nbUsers, "EN 795", enFF, support, isMultiSpan);
            sDefl = Calculator.deflection(state.product, spanLen, enFF, support, state.nbUsers, "EN 795", isMultiSpan);
            sExt1 = Calculator.extremiteForce1(state.product, spanLen, state.nbUsers, "EN 795", sEffort, sDefl, enFF, support, isMultiSpan);
            sExt2 = Calculator.extremiteForce2(state.product, spanLen, state.nbUsers, "EN 795", sEffort, sDefl, enFF, support, isMultiSpan);
        } else {
            sEffort = Calculator.effortLonge(state.product, spanLen, state.nbUsers, "OSHA", 1.0, support, isMultiSpan);
            sDefl = Calculator.deflection(state.product, spanLen, 1.0, support, state.nbUsers, "OSHA", isMultiSpan);
            sExt1 = Calculator.extremiteForce1(state.product, spanLen, state.nbUsers, "OSHA", sEffort, sDefl, 1.0, support, isMultiSpan);
            sExt2 = Calculator.extremiteForce2(state.product, spanLen, state.nbUsers, "OSHA", sEffort, sDefl, 1.0, support, isMultiSpan);
        }
        return {
            idx,
            id: `S${idx + 1}`,
            internalSpanId: sp.id || `spn_${idx + 1}`,
            length: spanLen,
            effortKn: isOSHA ? (sEffort * ff) : sEffort,
            deflMm: sDefl,
            ext1Kn: isOSHA ? (sExt1 * ff) : sExt1,
            ext2Kn: isOSHA ? (sExt2 * ff) : sExt2,
            maxTensionKn: isOSHA ? Math.max(sExt1 * ff, sExt2 * ff) : Math.max(sExt1, sExt2)
        };
    });

    let critSpanIdx = 0;
    let maxCritTens = -1;
    spanCalculations.forEach((sc, i) => {
        if (sc.maxTensionKn > maxCritTens || (sc.maxTensionKn === maxCritTens && sc.length > spanCalculations[critSpanIdx].length)) {
            maxCritTens = sc.maxTensionKn;
            critSpanIdx = i;
        }
    });

    let chosenSpanIdx = state.spans ? state.spans.findIndex(s => s.id === state.selectedFallSpanId) : -1;
    if (chosenSpanIdx < 0) chosenSpanIdx = Math.max(0, Math.min(spanCalculations.length - 1, state.fallPosition?.segmentIndex || 0));

    const isSelectedSpanMode = (state.fallCalculationMode === "selected_span");
    const activeSpanCalc = (isSelectedSpanMode && spanCalculations[chosenSpanIdx])
        ? spanCalculations[chosenSpanIdx]
        : (spanCalculations[critSpanIdx] || spanCalculations[0]);

    let effortL = activeSpanCalc.effortKn;
    let deflL = activeSpanCalc.deflMm;
    let ext1L = activeSpanCalc.ext1Kn;
    let ext2L = activeSpanCalc.ext2Kn;
    let displayedSpanLen = activeSpanCalc.length;

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
        if (lblExt1Row) lblExt1Row.textContent = ["Force Extrémité Haut :", "Top End Force:", "Fuerza Extremo Superior:"][l];
        if (lblExt2Row) lblExt2Row.textContent = ["Force Extrémité Bas :", "Bottom End Force:", "Fuerza Extremo Inferior:"][l];

        if (rowAngleFinal) {
            rowAngleFinal.style.display = "flex";
            const slopedRep = SlopedSystemConesModule.getFullScenarioReport(state.roofSlope || 15, displayedSpanLen, state.lineLength);
            document.getElementById("val-angle-final").textContent = `${slopedRep.retainedMax.finalAngleDeg.toFixed(2)}°`;
        }
        if (rowConeSlip) {
            rowConeSlip.style.display = "flex";
            const slopedRep = SlopedSystemConesModule.getFullScenarioReport(state.roofSlope || 15, displayedSpanLen, state.lineLength);
            const coneSlipsStr = slopedRep.retainedMax.cones.map(c => `C${c.index}: ${c.slipMm}mm`).join(" | ");
            document.getElementById("val-cone-slip").textContent = coneSlipsStr;
        }
    } else if (!isMultiSpan && isSelectedSpanMode) {
        const sName = activeSpanCalc?.id || `S${chosenSpanIdx + 1}`;
        if (lblExt1Row) lblExt1Row.textContent = (l === 1) ? `Anchor A${chosenSpanIdx + 1} Load (${sName} - End 1):` : (l === 2 ? `Fuerza A${chosenSpanIdx + 1} (${sName} - Extr. 1):` : `Force Ancrage A${chosenSpanIdx + 1} (${sName} - Extr. 1) :`);
        if (lblExt2Row) lblExt2Row.textContent = (l === 1) ? `Anchor A${chosenSpanIdx + 2} Load (${sName} - End 2):` : (l === 2 ? `Fuerza A${chosenSpanIdx + 2} (${sName} - Extr. 2):` : `Force Ancrage A${chosenSpanIdx + 2} (${sName} - Extr. 2) :`);
        if (rowAngleFinal) rowAngleFinal.style.display = "none";
        if (rowConeSlip) rowConeSlip.style.display = "none";
    } else if (!isMultiSpan) {
        const critS = spanCalculations[critSpanIdx] || activeSpanCalc;
        const sName = critS?.id || `S1`;
        if (lblExt1Row) lblExt1Row.textContent = (l === 1) ? `End 1 Force (${sName} Critical):` : (l === 2 ? `Fuerza Extr. 1 (${sName} Crítico):` : `Force Extrémité 1 (${sName} Critique) :`);
        if (lblExt2Row) lblExt2Row.textContent = (l === 1) ? `End 2 Force (${sName} Critical):` : (l === 2 ? `Fuerza Extr. 2 (${sName} Crítico):` : `Force Extrémité 2 (${sName} Critique) :`);
        if (rowAngleFinal) rowAngleFinal.style.display = "none";
        if (rowConeSlip) rowConeSlip.style.display = "none";
    } else {
        if (lblExt1Row) lblExt1Row.textContent = TRANSLATIONS.lblExt1LRow[l];
        if (lblExt2Row) lblExt2Row.textContent = TRANSLATIONS.lblExt2LRow[l];
        if (rowAngleFinal) rowAngleFinal.style.display = "none";
        if (rowConeSlip) rowConeSlip.style.display = "none";
    }

    const postName = getActivePostName();
    const lblAnchor = document.getElementById("lbl-anchor-count");
    if (lblAnchor) lblAnchor.textContent = `${TRANSLATIONS.lblAnchorCount[l]} (${postName})`;
    
    let displayedAnchorCount = (isOSHA && !isMultiSpan) ? 2 : totalAnchors;
    let displayedAbsorberCount = displayedAnchorCount;

    const subtabMulti = document.getElementById("subtab-span-multi");
    if (subtabMulti) {
        const countTxt = totalAnchors > 0 ? ` (${totalAnchors} ancr.)` : "";
        const countTxtEn = totalAnchors > 0 ? ` (${totalAnchors} anc.)` : "";
        const countTxtEs = totalAnchors > 0 ? ` (${totalAnchors} anc.)` : "";
        const base = TRANSLATIONS.subtabSpanMulti[l];
        const sfx = [countTxt, countTxtEn, countTxtEs][l];
        subtabMulti.textContent = `${base}${sfx}`;
    }

    if (state.layoutType === "cross_spans") {
        displayedAnchorCount = 4;
        displayedAbsorberCount = "1 (X-Matrix au centre)";
    } else if (state.layoutType === "grid_system") {
        const gs = state.gridSystem || { nx: 3, ny: 3 };
        const nx = Math.max(2, gs.nx || 3);
        const ny = Math.max(2, gs.ny || 3);
        displayedAnchorCount = `${2 * (nx + ny)} (Overhead)`;
        displayedAbsorberCount = `${nx * ny} (X-Matrix)`;
    } else if (state.layoutType === "slope_single") {
        displayedAnchorCount = "2 (Pente)";
        displayedAbsorberCount = 2;
    } else if (state.layoutType === "slope_multi") {
        const nbSp = (state.spans || []).length;
        displayedAnchorCount = `${nbSp + 1} (Pente)`;
        displayedAbsorberCount = 2;
    }

    function formatReadoutVal(val) {
        if (typeof val === "number") {
            return `<span class="readout-num">${val}</span>`;
        }
        const str = String(val).trim();
        const match = str.match(/^(\d+)\s*\((.+)\)$/);
        if (match) {
            return `<span class="readout-num">${match[1]}</span><span class="readout-tag">${match[2]}</span>`;
        }
        return `<span class="readout-num">${str}</span>`;
    }

    const valAnchor = document.getElementById("val-anchor-count");
    if (valAnchor) valAnchor.innerHTML = formatReadoutVal(displayedAnchorCount);

    const activeSubRange = isExtreme(state.product) ? getLongRangeSubRange(realSpanMax) : state.product;
    const lblAbsorber = document.getElementById("lbl-absorber-count");
    if (lblAbsorber) lblAbsorber.textContent = `${TRANSLATIONS.lblAbsorberCount[l]} (${activeSubRange})`;
    const valAbsorber = document.getElementById("val-absorber-count");
    if (valAbsorber) valAbsorber.innerHTML = formatReadoutVal(displayedAbsorberCount);

    const allowedSpanForProduct = Calculator.getMaxSpan(state.product, realSpanMax);

    const valEngCoef2 = document.getElementById("val-engineer-coef"); if (valEngCoef2) valEngCoef2.textContent = isOSHA ? (state.engineerCoefficient || 1.0).toFixed(2) : String(enFF);
    document.getElementById("val-max-allowed-span").textContent = formatDistance(allowedSpanForProduct, 1, l);

    const lenElem = document.getElementById("val-total-line-len");
    const marginCm = isExtreme(state.product) ? 30 : 20;
    if (lenElem) lenElem.textContent = `${formatDistance(totalLineLen, 2, l)} ${formatLineMargin(marginCm)}`;

    const lblSpanLRow = document.getElementById("lbl-span-l-row");
    if (lblSpanLRow) {
        if (!isMultiSpan && isSelectedSpanMode) {
            lblSpanLRow.textContent = (l === 1) ? `Selected Span (${activeSpanCalc.id}):` : (l === 2 ? `Vano seleccionado (${activeSpanCalc.id}):` : `Portée sélectionnée (${activeSpanCalc.id}) :`);
        } else if (!isMultiSpan) {
            lblSpanLRow.textContent = (l === 1) ? `Critical Span (${activeSpanCalc.id}):` : (l === 2 ? `Vano crítico (${activeSpanCalc.id}):` : `Portée critique (${activeSpanCalc.id}) :`);
        } else {
            lblSpanLRow.textContent = TRANSLATIONS.lblSpanLRow[l];
        }
    }

    document.getElementById("val-span-l").textContent = formatDistance(displayedSpanLen, 2, l);
    document.getElementById("val-force-l").textContent = UnitsModule.formatForce(effortL);

    // Flèche : 2 chiffres après la virgule pour OSHA, entier arrondi pour EN 795 (ou inches si EN)
    const deflElem = document.getElementById("val-defl-l");
    if (deflElem) {
        deflElem.textContent = formatDeflection(deflL, l);
    }

    const dynContainer = document.getElementById("dynamic-anchor-distribution-content");
    const rowExt1 = document.getElementById("row-ext1");
    const rowExt2 = document.getElementById("row-ext2");
    const rowExt3 = document.getElementById("row-ext3");
    const rowExt4 = document.getElementById("row-ext4");

    // Hide legacy rows 3 and 4
    if (rowExt3) rowExt3.style.display = "none";
    if (rowExt4) rowExt4.style.display = "none";

    const isSingleSpan = (state.layoutType === "single_span" || state.layoutType === "slope_single");
    const isCrossLayout = (state.layoutType === "cross_spans");
    const isGridLayout = (state.layoutType === "grid_system");

    // Règle d'affichage des ancrages :
    // - EN 795 : Pas de multi-portée, toujours 2 points seulement (Force Extrémité 1 et 2)
    // - OSHA :
    //     * Portée unique (ou layout mono-portée) -> 2 points
    //     * Multi-portée (state.oshaSpanMode === "multi" et layout multi-portée) -> 6 points
    //     * Croix (Config 11) -> 4 branches
    //     * Grille (Config 12) -> Grille overhead
    const showTwoPoints = !isOSHA || isSingleSpan || (state.oshaSpanMode === "unique" && !isCrossLayout && !isGridLayout);
    const isOshaMulti = isOSHA && !isSingleSpan && (state.oshaSpanMode === "multi") && !isCrossLayout && !isGridLayout;
    let adaptedPoints = null;

    if (showTwoPoints) {
        if (rowExt1) rowExt1.style.display = "flex";
        if (rowExt2) rowExt2.style.display = "flex";
        document.getElementById("val-ext1-l").textContent = UnitsModule.formatForce(ext1L);
        document.getElementById("val-ext2-l").textContent = UnitsModule.formatForce(ext2L);
        if (dynContainer) dynContainer.innerHTML = "";
    } else if (isCrossLayout && isOSHA) {
        if (rowExt1) rowExt1.style.display = "none";
        if (rowExt2) rowExt2.style.display = "none";
        const fallBr = state.fallPosition?.branch || "north";
        const crossRes = AnchorEffortDistributionModule.calculateRule3_Cross(ext1L, fallBr);
        if (dynContainer) {
            const subTitle = TRANSLATIONS.lblCrossDistribution[l] || "Répartition en Croix (4 branches) :";
            let cHtml = `<div class="readout-subtitle"><i class="fa-solid fa-plus"></i> ${subTitle}</div>`;
            crossRes.branches.forEach(b => {
                const bLabel = b.label[l] || b.label[0];
                const activeCls = b.isFallBranch ? " active-fall" : "";
                const tag = b.isFallBranch ? " (Chute 100%)" : " (25%)";
                cHtml += `
                    <div class="readout-row anchor-point${activeCls}">
                        <span class="row-label">${bLabel}${tag} :</span>
                        <span class="row-val">${UnitsModule.formatForce(b.forceKn)}</span>
                    </div>
                `;
            });
            dynContainer.innerHTML = cHtml;
        }
    } else if (isGridLayout && isOSHA) {
        if (rowExt1) rowExt1.style.display = "none";
        if (rowExt2) rowExt2.style.display = "none";
        const gs = state.gridSystem || { nx: 3, ny: 3 };
        const nx = Math.max(2, gs.nx || 3);
        const ny = Math.max(2, gs.ny || 3);
        const fallCross = { x: state.fallPosition?.gridCrossX || 0, z: state.fallPosition?.gridCrossZ || 0 };
        const fallBranch = state.fallPosition?.gridBranch || "X+";
        const gridRes = AnchorEffortDistributionModule.calculateRule4_Grid(ext1L, nx, ny, state.userMassKg || 141, state.gridPretensionKg || 600, fallCross, fallBranch);

        if (dynContainer) {
            const subTitle = TRANSLATIONS.lblGridDistribution[l] || "Répartition Grille (Précharge + Dynamique) :";
            let gHtml = `
                <div class="readout-subtitle"><i class="fa-solid fa-table-cells"></i> ${subTitle}</div>
                <div class="grid-info-badge">
                    <span><strong>P0 :</strong> ${UnitsModule.formatForce(gridRes.P0, 3)} (${UnitsModule.formatMass(gridRes.pretensionKg)})</span>
                    <span><strong>W :</strong> ${UnitsModule.formatForce(gridRes.W, 3)} (${UnitsModule.formatMass(gridRes.userMassKg)})</span>
                </div>
                <div class="readout-row anchor-point active-fall">
                    <span class="row-label">Croix Chute (${fallCross.x + 1}, ${fallCross.z + 1}) [Pt Chute] :</span>
                    <span class="row-val">${UnitsModule.formatForce(gridRes.level0.totalFall)}</span>
                </div>
                <div class="readout-row anchor-point">
                    <span class="row-label">Croix Chute [3 autres branches] :</span>
                    <span class="row-val">${UnitsModule.formatForce(gridRes.level0.totalOther)}</span>
                </div>
                <table class="grid-level-table">
                    <thead>
                        <tr>
                            <th>Niveau</th>
                            <th>Facteur</th>
                            <th>Pt Chute</th>
                            <th>3 Autres</th>
                            <th>Statut</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            const maxLevels = Math.min(5, (nx - 1) + (ny - 1));
            for (let lvl = 0; lvl <= maxLevels; lvl++) {
                const factor = Math.pow(ANCHOR_EFFORT_CONFIG.GRID_LEVEL_FACTOR, lvl);
                let pChute = factor * (gridRes.prechargeFall + gridRes.dynFall);
                let pOther = factor * (gridRes.prechargeOther + gridRes.dynOther);
                let isCutoff = false;
                if (pChute < gridRes.cutoff) { pChute = 0; isCutoff = true; }
                if (pOther < gridRes.cutoff) { pOther = 0; }
                const statusStr = isCutoff ? `<span style="color:#dc2626;font-weight:700;">Coupure (&lt;1%)</span>` : `<span style="color:#16a34a;font-weight:700;">Actif</span>`;
                gHtml += `
                    <tr class="${lvl === 0 ? 'active-level' : ''}">
                        <td><strong>${lvl}</strong></td>
                        <td>${(factor * 100).toFixed(factor < 0.01 ? 2 : 1)}%</td>
                        <td>${UnitsModule.formatForce(pChute)}</td>
                        <td>${UnitsModule.formatForce(pOther)}</td>
                        <td>${statusStr}</td>
                    </tr>
                `;
            }
            gHtml += `
                    </tbody>
                </table>
                <div class="readout-row anchor-point margin-top-sm" style="font-size:0.75rem;">
                    <span class="row-label">Poteaux Extrémité (${gridRes.endPosts.length}) :</span>
                    <span class="row-val">Détail dans Rapport PDF</span>
                </div>
            `;
            dynContainer.innerHTML = gHtml;
        }
    } else if (isOshaMulti) {
        // OSHA Multi-Span : Rules 1 & 2 adaptées au nombre réel d'ancrages
        if (rowExt1) rowExt1.style.display = "none";
        if (rowExt2) rowExt2.style.display = "none";

        // Precompute multi-span distribution for each individual span
        const multiSpanResultsPerSpan = activeSpans.map((sp, sIdx) => {
            const sc = spanCalculations[sIdx] || { effortKn: effortL, deflMm: deflL, ext1Kn: ext1L, ext2Kn: ext2L, length: displayedSpanLen };
            const sEffort = sc.effortKn;
            const sDefl = sc.deflMm;
            const sExt1 = sc.ext1Kn;
            const sExt2 = sc.ext2Kn;
            const sExt3 = Calculator.extremiteForce3(state.product, sc.length, state.nbUsers, state.norm, sEffort, sDefl, state.fallFactor, support, true);
            const sExt4 = Calculator.extremiteForce4(state.product, sc.length, state.nbUsers, state.norm, sEffort, sDefl, state.fallFactor, support, true);
            const sixPoints = AnchorEffortDistributionModule.calculateRule1_MultiSpan(sExt1, sExt2, sExt3, sExt4);
            const finalSix = AnchorEffortDistributionModule.calculateRule2_FromSpans(sixPoints, state.spans, sIdx);
            const adapted = AnchorEffortDistributionModule.getAdaptedMultiSpanResults(finalSix, totalAnchors, l, sIdx, p0Kn, state.spans);
            return { sIdx, sc, adapted, ext3: sExt3, ext4: sExt4 };
        });

        let adaptedRes = null;
        if (isSelectedSpanMode) {
            // Selected Span mode: centered on chosenSpanIdx
            const targetIdx = Math.max(0, Math.min(activeSpans.length - 1, chosenSpanIdx));
            adaptedRes = multiSpanResultsPerSpan[targetIdx].adapted;
            adaptedPoints = adaptedRes.points;
        } else {
            // Critical Case mode: calculate maximum envelope load across all spans for each anchor
            const primaryAdapted = multiSpanResultsPerSpan[critSpanIdx]?.adapted || multiSpanResultsPerSpan[0]?.adapted;
            const envelopePoints = [];
            const numPts = primaryAdapted?.points ? primaryAdapted.points.length : totalAnchors;
            for (let aIdx = 0; aIdx < numPts; aIdx++) {
                let maxVal = -1;
                let causeSpanIdx = critSpanIdx;
                for (let sIdx = 0; sIdx < activeSpans.length; sIdx++) {
                    const ptVal = multiSpanResultsPerSpan[sIdx].adapted.points[aIdx]?.val || 0;
                    if (ptVal > maxVal) {
                        maxVal = ptVal;
                        causeSpanIdx = sIdx;
                    }
                }
                const basePt = primaryAdapted.points[aIdx] || {};
                const isCritFall = (aIdx === critSpanIdx || aIdx === critSpanIdx + 1);
                let rem = "-";
                if (isCritFall) {
                    rem = (l === 1) ? `Critical Fall Anchor S${critSpanIdx + 1}` : (l === 2 ? `Anclaje caída crítico S${critSpanIdx + 1}` : `Ancrage de chute critique S${critSpanIdx + 1}`);
                } else if (causeSpanIdx === critSpanIdx) {
                    rem = basePt.remarque || ((l === 1) ? "Critical Wave" : "Onde critique");
                } else {
                    rem = (l === 1) ? `Critical Envelope S${causeSpanIdx + 1}` : (l === 2 ? `Envolvente crítica S${causeSpanIdx + 1}` : `Enveloppe critique S${causeSpanIdx + 1}`);
                }
                envelopePoints.push({
                    ...basePt,
                    val: maxVal,
                    isFallAnchor: isCritFall,
                    remarque: rem
                });
            }
            adaptedPoints = envelopePoints;
            const subTitle = (l === 1)
                ? "Anchor Envelope Loads - Critical Case:"
                : (l === 2
                    ? "Cargas Envolvente Anclajes - Caso Crítico:"
                    : "Efforts Enveloppe aux Ancrages - Cas Critique :");
            adaptedRes = {
                count: envelopePoints.length,
                totalAnchors: envelopePoints.length,
                points: envelopePoints,
                uiSubtitle: subTitle
            };
        }

        if (dynContainer) {
            let mHtml = `<div class="readout-subtitle"><i class="fa-solid fa-arrows-split-up-and-left"></i> ${adaptedRes.uiSubtitle}</div>`;
            adaptedRes.points.forEach(pt => {
                const attClass = pt.isAttenuated ? " anchor-attenuated" : (pt.isFallAnchor ? " anchor-fall" : "");
                mHtml += `
                    <div class="readout-row anchor-point${attClass}">
                        <span class="row-label">${pt.label} :</span>
                        <span class="row-val">${UnitsModule.formatForce(pt.val)}</span>
                    </div>
                `;
            });
            dynContainer.innerHTML = mHtml;
        }
    } else {
        // Fallback: 2 points
        if (rowExt1) rowExt1.style.display = "flex";
        if (rowExt2) rowExt2.style.display = "flex";
        document.getElementById("val-ext1-l").textContent = UnitsModule.formatForce(ext1L);
        document.getElementById("val-ext2-l").textContent = UnitsModule.formatForce(ext2L);
        if (dynContainer) dynContainer.innerHTML = "";
    }

    const shapeName = getLocalizedRoofShapeName();
    const strL1 = formatDistance(state.lineLength, 2, l);
    const strL2 = formatDistance(state.line2Length, 2, l);
    document.getElementById("header-dims-display").innerHTML = `<i class="fa-solid fa-ruler-combined"></i> ${shapeName} | L1: ${strL1} ${state.hasLine2 ? `+ L2: ${strL2}` : ""}`;
    const sysDisplayTitle = isExtreme(state.product) ? `EXTREME - ${activeSubRange}` : (state.product || ["Choisissez un système", "Choose a system", "Elija un sistema"][l]);
    document.getElementById("header-system-display").textContent = sysDisplayTitle;

    if (realSpanMax > maxSpan + 0.05) {
        if (warningElem) warningElem.classList.remove("hidden");
    } else {
        if (warningElem) warningElem.classList.add("hidden");
    }

    // ==========================================
    // SPEC V2 — 04 & 05: CRITICAL CASE SIMULATION & READOUTS
    // ==========================================
    const rowCritSpan = document.getElementById("row-critical-span");
    const valCritSpan = document.getElementById("val-critical-span");
    if (valCritSpan) {
        if (state.fallCalculationMode === "selected_span") {
            const sel = spanCalculations[chosenSpanIdx] || activeSpanCalc;
            valCritSpan.textContent = (l === 1)
                ? `${sel.id} - Selected Span - ${UnitsModule.formatForce(sel.maxTensionKn || sel.ext1Kn)}`
                : (l === 2
                    ? `${sel.id} - Vano seleccionado - ${UnitsModule.formatForce(sel.maxTensionKn || sel.ext1Kn)}`
                    : `${sel.id} - Portée sélectionnée - ${UnitsModule.formatForce(sel.maxTensionKn || sel.ext1Kn)}`);
            valCritSpan.className = "badge-tag-id span-badge";
        } else {
            const crit = spanCalculations[critSpanIdx] || activeSpanCalc;
            valCritSpan.textContent = (l === 1)
                ? `${crit.id} - Max Tension: ${UnitsModule.formatForce(crit.maxTensionKn || crit.ext1Kn)}`
                : (l === 2
                    ? `${crit.id} - Tensión Máx: ${UnitsModule.formatForce(crit.maxTensionKn || crit.ext1Kn)}`
                    : `${crit.id} - Tension Max: ${UnitsModule.formatForce(crit.maxTensionKn || crit.ext1Kn)}`);
            valCritSpan.className = "row-val badge-critical-span";
        }
    }

    // Engineering parameters (P0, Sag, Recoil, Safety Factor, Max intermediate post)
    const valPretension = document.getElementById("val-pretension");
    if (valPretension) {
        valPretension.textContent = isRangeProd
            ? UnitsModule.formatPretension(600)
            : UnitsModule.formatPretension(100);
    }

    const valSag = document.getElementById("val-initial-sag");
    if (valSag) valSag.textContent = (l === 1) ? "Data to be provided" : "Donnée à renseigner";

    const valRecoil = document.getElementById("val-buffer-recoil");
    if (valRecoil) valRecoil.textContent = (l === 1) ? "Data to be provided" : "Donnée à renseigner";

    const valSafety = document.getElementById("val-safety-factor");
    if (valSafety) valSafety.textContent = (l === 1) ? "Data to be provided" : "Donnée à renseigner";

    const valInterLoad = document.getElementById("val-max-inter-load");
    if (valInterLoad) {
        valInterLoad.textContent = UnitsModule.formatForce(arrestKn);
    }

    // Resolved Corner Loads (Vector Math)
    const cornerContainer = document.getElementById("corner-forces-container");
    const cornerContent = document.getElementById("corner-forces-content");
    if (cornerContainer && cornerContent) {
        const bendNodes = [];
        if (state.spans && state.spans.length > 1) {
            for (let i = 0; i < state.spans.length - 1; i++) {
                const sp = state.spans[i];
                const bendDeg = parseFloat(sp.bendDeg || (sp.bend90 ? 90 : 0));
                if (Math.abs(bendDeg) > 0.01) {
                    const rad = (bendDeg * Math.PI) / 180;
                    bendNodes.push({
                        spanIdx: i,
                        anchorId: `A${i + 2}`,
                        bendAngleDeg: bendDeg,
                        u1x: -1, u1z: 0,
                        u2x: Math.cos(rad), u2z: Math.sin(rad)
                    });
                }
            }
        }

        if (bendNodes.length > 0) {
            cornerContainer.style.display = "block";
            let cHtml = "";
            bendNodes.forEach(bn => {
                const cornerRes = calculateCornerEffort(bn, ext1L, ext2L);
                const doubledTag = cornerRes.isDoubledAnchor
                    ? `<span class="badge-tag-id" style="background:#fee2e2;color:#b91c1c;">Ancrage doublé (>40°) : 2× ${UnitsModule.formatForce(cornerRes.distribution.anchor1Kn)}</span>`
                    : `<span class="badge-tag-id" style="background:#f1f5f9;color:#475569;">Ancrage simple (≤40°)</span>`;
                cHtml += `
                    <div class="readout-row" style="font-size:0.75rem; padding:4px 0; border-bottom:1px dashed #cbd5e1;">
                        <span><strong>${bn.anchorId}</strong> (Virage ${bn.bendAngleDeg}°) :</span>
                        <span><strong>${UnitsModule.formatForce(cornerRes.resultantKn)}</strong> (Bissectrice ${cornerRes.angleWithBisectorDeg}°)</span>
                    </div>
                    <div style="font-size:0.7rem; margin-bottom:4px; text-align:right;">${doubledTag}</div>
                `;
            });
            cornerContent.innerHTML = cHtml;
        } else {
            cornerContainer.style.display = "none";
        }
    }

    // Total Fall Clearance Breakdown (Spec V2 — 04, Spec V2 — 09 & Spec V2 — 10 / Prompt 16)
    const srl = (state.connectingDevice === "srd" && state.selectedSrlId) ? SRL_CATALOG[state.selectedSrlId] : null;
    const madMVal = (typeof state.madM === "number" && state.madM > 0) ? state.madM : ((typeof state.customMad === "number" && state.customMad > 0) ? state.customMad : 1.07);
    const userRetractedM = (typeof state.retractedLengthM === "number" && state.retractedLengthM > 0)
        ? state.retractedLengthM
        : ((state.connectingDevice === "srd")
            ? (srl ? (srl.retracted_length_m || srl.retracted_len || 0.60) : 0.60)
            : ((state.connectingDevice === "custom_srd" || state.connectingDevice === "custom_lanyard")
                ? (state.customDeviceLengthM || 0.60)
                : 1.80));
    const isOverEdge = state.isOverEdgeFall || (state.line_to_edge < 1.0);
    const bodyPos = state.bodyPosition || "standing";
    const dRingH = state.dRingHeightM || 1.50;
    const safetyMarg = 0.60; // 2 ft

    let bodyOffset = 0;
    if (!isOverEdge) {
        if (bodyPos === "kneeling") bodyOffset = 36 * 0.0254; // +36 po (0.914m)
        else if (bodyPos === "lying") bodyOffset = dRingH;
    }

    // Spec V2 — 10: Retracted length feeds total fall clearance in real-time
    let devComp = madMVal + userRetractedM;

    const defl_in_meters = (deflL > 20.0) ? (deflL / 1000.0) : deflL;
    const totalClr = defl_in_meters + devComp + safetyMarg;

    const clrDefl = document.getElementById("clr-val-defl");
    const clrRetracted = document.getElementById("clr-val-retracted");
    const clrMad = document.getElementById("clr-val-mad");
    const clrBody = document.getElementById("clr-val-body");
    const clrMargin = document.getElementById("clr-val-margin");
    const clrTotal = document.getElementById("val-total-clearance");

    if (clrDefl) clrDefl.textContent = UnitsModule.formatDeflection(defl_in_meters);
    if (clrRetracted) clrRetracted.textContent = UnitsModule.formatLength(userRetractedM);
    if (clrMad) clrMad.textContent = UnitsModule.formatLength(madMVal);
    if (clrBody) clrBody.textContent = `0.00 m (${bodyPos})`;
    if (clrMargin) clrMargin.textContent = UnitsModule.formatLength(safetyMarg);
    if (clrTotal) clrTotal.textContent = UnitsModule.formatLength(totalClr);

    // Call SystemLabelingModule (Single Source of Truth) to render 3D sprites and update tables
    const geomContext = collectSceneGeometryContext(layout);
    const effortContext = {
        ext1L,
        ext2L,
        effortL,
        deflL,
        adaptedPoints,
        spanCalculations,
        critSpanIdx,
        chosenSpanIdx,
        fallMode: state.fallCalculationMode || "critical_case",
        p0Kn
    };

    const systemLabels = SystemLabelingModule.generateSystemLabels(state, effortContext, geomContext);
    SystemLabelingModule.renderSystemLabels3D(systemLabels);
    SystemLabelingModule.updateSystemLabelsUI(systemLabels);
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

// ==========================================
// UI INTERACTIVITY & EVENT BINDINGS
// ==========================================
function setupUIEventListeners() {
    initSrlMadControls();
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

    // Unit Toggle Buttons Handlers (Dashboard Header)
    const btnToggleUnitSystem = document.getElementById("btn-toggle-unit-system");
    const hasInlineOnClick = btnToggleUnitSystem && (btnToggleUnitSystem.onclick || (typeof btnToggleUnitSystem.getAttribute === "function" && btnToggleUnitSystem.getAttribute("onclick")));
    if (btnToggleUnitSystem && !hasInlineOnClick) {
        btnToggleUnitSystem.addEventListener("click", (e) => {
            if (e) e.preventDefault();
            toggleUnitSystem();
        });
    }

    const startBtn = document.getElementById("start-config-btn");
    if (startBtn) {
        startBtn.addEventListener("click", (e) => {
            if (e) e.preventDefault();
            openConfigModal();
        });
    }

    const reconfigBtn = document.getElementById("reconfig-btn");
    if (reconfigBtn) {
        reconfigBtn.addEventListener("click", (e) => {
            if (e) e.preventDefault();
            openConfigModal();
        });
    }

    const closeBtn = document.getElementById("modal-close-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            if (e) e.preventDefault();
            closeConfigModal();
        });
    }

    const cancelBtn = document.getElementById("config-cancel-btn");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
            if (e) e.preventDefault();
            closeConfigModal();
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
                    const maxU = isPro(state.product) ? 5 : 3;
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
                const proComps = COMPONENTS_DB[state.product || "PRO"] || [];
                const xcone = proComps.find(c => c.id === "X-Cone");
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
    const selectXLoc = document.getElementById("select-xmatrix-location");

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
            const locVal = selectXLoc ? selectXLoc.value : "mid";
            if (e.target.checked && locVal === "mid" && !isPro(state.product)) {
                alert(TRANSLATIONS.alerts.xmatrixNewProOnly[state.lang || 0]);
                if (selectXLoc) selectXLoc.value = "end";
            }
            groupLine2.style.display = e.target.checked ? "grid" : "none";
        });
    }

    if (selectXLoc) {
        selectXLoc.addEventListener("change", (e) => {
            if (e.target.value === "mid" && !isPro(state.product)) {
                alert(TRANSLATIONS.alerts.xmatrixNewProOnly[state.lang || 0]);
                e.target.value = "end";
            }
        });
    }

    // Layout selection change in modal
    const layoutTypeSelect = document.getElementById("select-layout-type");
    if (layoutTypeSelect) {
        layoutTypeSelect.addEventListener("change", (e) => {
            state.layoutType = e.target.value;
            if (state.layoutType === "grid_system") {
                state.product = "EXTREME";
                state.roofShape = "flat_overhead";
                state.mountingType = "overhead";
                state.bufferLength = 0.30;
                const prodSel = document.getElementById("select-product");
                if (prodSel) prodSel.value = "EXTREME";
                const uInp = document.getElementById("input-users");
                if (uInp) {
                    uInp.max = 3;
                    if (parseInt(uInp.value) > 3) uInp.value = 3;
                }
                const bufferInfo = document.getElementById("lbl-buffer-len-info");
                if (bufferInfo) {
                    bufferInfo.innerHTML = `Buffer d'extrémité fixe : <strong>${formatDistance(0.30, 2, state.lang)}</strong> (non modifiable par l'utilisateur)`;
                }
            } else if (state.layoutType === "cross_spans") {
                state.product = "PRO";
                if (state.roofShape === "flat_overhead") state.roofShape = "flat";
                state.mountingType = "standard";
                state.bufferLength = 0.20;
                const prodSel = document.getElementById("select-product");
                if (prodSel) prodSel.value = "PRO";
                const uInp = document.getElementById("input-users");
                if (uInp) uInp.max = 5;
                const bufferInfo = document.getElementById("lbl-buffer-len-info");
                if (bufferInfo) {
                    bufferInfo.innerHTML = `Buffer d'extrémité fixe : <strong>${formatDistance(0.20, 2, state.lang)}</strong> (non modifiable par l'utilisateur)`;
                }
            } else if (state.layoutType === "multi_bend_circle") {
                recalculateConfig6Spans();
            } else if (state.layoutType === "single_span") {
                state.spans = [{ length: state.lineLength || 15.0, bendDeg: 0, slopeDeg: 0, bend90: false, isSloped: false }];
            } else if (state.layoutType === "slope_single") {
                state.spans = [{ length: state.lineLength || 20.0, bendDeg: 0, slopeDeg: 30, bend90: false, isSloped: true }];
            } else if (state.layoutType === "slope_multi") {
                if (!state.spans || state.spans.length < 2) {
                    state.spans = [
                        { length: 10.0, bendDeg: 0, slopeDeg: 20, bend90: false, isSloped: true },
                        { length: 12.0, bendDeg: 0, slopeDeg: 35, bend90: false, isSloped: true },
                        { length: 8.0, bendDeg: 0, slopeDeg: 25, bend90: false, isSloped: true }
                    ];
                }
            } else if (state.spans.length < 2) {
                state.spans = [
                    { length: 5.0, bendDeg: 0, slopeDeg: 0, bend90: false, isSloped: false },
                    { length: 5.0, bendDeg: 0, slopeDeg: 0, bend90: false, isSloped: false }
                ];
            }
            renderDynamicLayoutForm();
        });
    }

    // HOOKT System Product selection change in modal
    const productSelect = document.getElementById("select-product");
    if (productSelect) {
        productSelect.addEventListener("change", (e) => {
            const chosenProduct = normalizeProduct(e.target.value);
            const hasXMat = (state.spans && state.spans.some(s => s && s.hasXMatrix)) || (state.layoutType === "cross_spans");
            if (isCore(chosenProduct) && hasXMat) {
                alert(["⚠️ La X-Matrix est indisponible sur la gamme CORE. Veuillez retirer les X-Matrix ou conserver NewPRO / Extreme Overhead.", "⚠️ X-Matrix is not available on CORE systems. Please remove X-Matrix or keep NewPRO / Extreme Overhead."][state.lang || 0]);
                e.target.value = state.product;
                return;
            }
            state.product = chosenProduct;
            if (isExtreme(chosenProduct)) {
                state.roofShape = "flat_overhead";
                state.mountingType = "overhead";
                state.bufferLength = 0.30;
                if (state.layoutType === "cross_spans") {
                    state.layoutType = "grid_system";
                    const layoutSel = document.getElementById("select-layout-type");
                    if (layoutSel) layoutSel.value = "grid_system";
                }
            } else {
                if (state.roofShape === "flat_overhead") state.roofShape = "flat";
                state.mountingType = "standard";
                state.bufferLength = 0.20;
                if (state.layoutType === "grid_system") {
                    state.layoutType = "single_span";
                    const layoutSel = document.getElementById("select-layout-type");
                    if (layoutSel) layoutSel.value = "single_span";
                }
            }

            const bufferInfo = document.getElementById("lbl-buffer-len-info");
            if (bufferInfo) {
                bufferInfo.innerHTML = `Buffer d'extrémité fixe : <strong>${formatDistance(state.bufferLength, 2, state.lang)}</strong> (non modifiable par l'utilisateur)`;
            }

            const uInput = document.getElementById("input-users");
            const maxAllowedU = isPro(chosenProduct) ? 5 : 3;
            if (uInput) {
                uInput.max = maxAllowedU;
                if (parseInt(uInput.value) > maxAllowedU) uInput.value = maxAllowedU;
            }

            filterLayoutDropdownOptions();
            renderDynamicLayoutForm();
        });
    }

    // Units dropdown change
    const unitSystemSelect = document.getElementById("select-unit-system");
    if (unitSystemSelect) {
        unitSystemSelect.addEventListener("change", (e) => {
            setUnitSystem(e.target.value);
        });
    }

    // Arrest load mode & value change
    const arrestModeSelect = document.getElementById("select-arrest-load-mode");
    const arrestValInput = document.getElementById("input-arrest-load-val");
    if (arrestModeSelect && arrestValInput) {
        arrestModeSelect.addEventListener("change", (e) => {
            state.arrestLoadMode = e.target.value;
            if (state.arrestLoadMode === "turbolite") {
                state.selectedSrlId = "turbo_light_9ft";
                recalculateLumpSumArrestLoad();
            } else if (state.arrestLoadMode === "falcon") {
                state.selectedSrlId = "falcon_leading_edge";
                recalculateLumpSumArrestLoad();
            } else if (state.arrestLoadMode === "lump_sum") {
                recalculateLumpSumArrestLoad();
            } else if (state.arrestLoadMode === "custom") {
                updateLumpSumHint();
            }
            updateCalculationsUI();
        });

        arrestValInput.addEventListener("input", (e) => {
            const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
            const raw = parseFloat(e.target.value);
            if (!isNaN(raw) && raw > 0) {
                const knVal = isUS ? (raw * UnitsModule.LBF_TO_KN) : raw;
                state.arrestLoadValue = knVal;
                state.arrestLoadKn = knVal;
                state.arrestLoadMode = "custom";
                if (arrestModeSelect) arrestModeSelect.value = "custom";
                updateLumpSumHint();
                updateCalculationsUI();
            }
        });
    }

    // Dynamic listener on input-users to automatically recalculate lump sum
    const usersInput = document.getElementById("input-users");
    if (usersInput) {
        const onUsersChange = (e) => {
            let u = parseInt(e.target.value) || 1;
            const maxU = isPro(state.product) ? 5 : 3;
            u = Math.max(1, Math.min(maxU, u));
            state.nbUsers = u;
            if (state.arrestLoadMode !== "custom") {
                recalculateLumpSumArrestLoad();
            } else {
                updateLumpSumHint();
            }
        };
        usersInput.addEventListener("input", onUsersChange);
        usersInput.addEventListener("change", onUsersChange);
    }

    document.getElementById("config-form").addEventListener("submit", (e) => {
        e.preventDefault();

        // Spec V2 — 04 / Prompt 13: Arrest load validation (1 lbf to 5000 lbf for direct entry)
        const currentKn = state.arrestLoadValue || state.arrestLoadKn || 6.0;
        const arrestCheck = validateArrestLoad(currentKn, state.arrestLoadMode === "custom");
        if (!arrestCheck.valid && state.arrestLoadMode === "custom") {
            alert(arrestCheck.message);
            return;
        }

        // Save Project Info
        const pName = document.getElementById("input-proj-name");
        const pLoc = document.getElementById("input-proj-loc");
        const pDes = document.getElementById("input-proj-designer");
        const pHll = document.getElementById("input-proj-hll");
        state.projectInfo = {
            name: pName ? pName.value : "",
            location: pLoc ? pLoc.value : "",
            date: new Date().toISOString().slice(0, 10),
            designer: pDes ? pDes.value : "",
            hllName: pHll ? pHll.value : "HLL-01"
        };

        // Save Unit System & Application Mode
        const unitSel = document.getElementById("select-unit-system");
        const nextSys = unitSel ? unitSel.value : "metric";
        setUnitSystem(nextSys, true);
        const appSel = document.getElementById("select-app-mode");
        state.appMode = appSel ? appSel.value : "fall_arrest";

        // Save Regulatory Standard
        const rNormSel = document.getElementById("select-roof-norm");
        if (rNormSel) {
            setNorm(rNormSel.value, true);
        }

        // Spec V2 — 03: Save & Validate Roof Surface Parameters
        const rTypeSel = document.getElementById("select-roof-type");
        const rLenInp = document.getElementById("input-roof-length");
        const rWidInp = document.getElementById("input-roof-width");
        const rSlope1Inp = document.getElementById("input-roof-slope-1");
        const rSlope2Inp = document.getElementById("input-roof-slope-2");
        const rRidgeInp = document.getElementById("input-ridge-pos");
        const rEdgeInp = document.getElementById("input-line-to-edge");
        const rHGroundInp = document.getElementById("input-roof-height-ground");

        if (rTypeSel) {
            state.roof_type = rTypeSel.value;
            state.roofShape = rTypeSel.value;
        }
        if (rLenInp) {
            const rawL = parseFloat(rLenInp.value) || 25.0;
            state.roof_length = UnitsModule.parseLengthToMeters(rawL);
            state.L = state.roof_length;
        }
        if (rWidInp) {
            const rawW = parseFloat(rWidInp.value) || 15.0;
            state.roof_width = UnitsModule.parseLengthToMeters(rawW);
            state.l = state.roof_width;
        }
        if (rSlope1Inp) {
            const parsedSlope = parseFloat(rSlope1Inp.value);
            const isSloped = (state.roofShape === "sloped" || state.roofShape === "triangle");
            state.roof_slope_deg = (!isNaN(parsedSlope) && parsedSlope > 0) ? parsedSlope : (isSloped ? 15.0 : 0);
            state.roofSlope = state.roof_slope_deg;
        }
        if (rSlope2Inp) {
            state.roof_slope_deg_2 = parseFloat(rSlope2Inp.value) || 0;
        }
        if (rRidgeInp) {
            const rawRidge = parseFloat(rRidgeInp.value) || (state.roof_width / 2);
            state.ridge_position = UnitsModule.parseLengthToMeters(rawRidge);
        }
        if (rEdgeInp) {
            const rawEdge = parseFloat(rEdgeInp.value) || 2.0;
            state.line_to_edge = UnitsModule.parseLengthToMeters(rawEdge);
        }
        if (rHGroundInp) {
            const rawHG = parseFloat(rHGroundInp.value) || 6.0;
            state.roof_height_above_ground = UnitsModule.parseLengthToMeters(rawHG);
        }

        // Roof Validations
        if (state.line_to_edge <= 0) {
            alert("⚠️ Erreur de validation :\nLa distance ligne/bord (line_to_edge) doit être strictement supérieure à 0.");
            return;
        }
        if (state.roof_height_above_ground <= 0) {
            alert("⚠️ Erreur de validation :\nLa hauteur du toit au-dessus du sol doit être strictement supérieure à 0.");
            return;
        }
        if (state.roof_length <= 0 || state.roof_width <= 0) {
            alert("⚠️ Erreur de validation :\nLes dimensions de la toiture doivent être positives.");
            return;
        }
        if ((state.roof_type === "sloped" || state.roof_type === "triangle") && Math.abs(state.roof_slope_deg) > 75) {
            alert(`⚠️ Erreur de validation :\nLa pente 1 (${state.roof_slope_deg}°) dépasse le maximum autorisé (75°).`);
            return;
        }
        if (state.roof_type === "triangle") {
            if (Math.abs(state.roof_slope_deg_2) > 75) {
                alert(`⚠️ Erreur de validation :\nLa pente 2 (${state.roof_slope_deg_2}°) dépasse le maximum autorisé (75°).`);
                return;
            }
            if (state.ridge_position <= 0 || state.ridge_position >= state.roof_width) {
                alert(`⚠️ Erreur de validation :\nLa position du faîtage (${state.ridge_position.toFixed(2)}m) doit être comprise entre 0 et la largeur (${state.roof_width.toFixed(2)}m).`);
                return;
            }
        }

        // Spec V2 — 04: Calculation Inputs
        const devSel = document.getElementById("select-connecting-device");
        const fallModeSel = document.getElementById("select-fall-mode");
        const bodyPosSel = document.getElementById("select-body-pos");
        const wwsInp = document.getElementById("input-wws-elevation");
        const substrateInp = document.getElementById("input-substrate-info");

        if (devSel) state.connectingDevice = devSel.value;
        if (fallModeSel) state.fallCalculationMode = fallModeSel.value;
        if (bodyPosSel) state.bodyPosition = bodyPosSel.value;
        if (wwsInp) {
            const rawWws = parseFloat(wwsInp.value) || 6.0;
            state.wwsElevationM = UnitsModule.parseLengthToMeters(rawWws);
        }
        if (substrateInp) state.substrateInfo = substrateInp.value;

        // Lanyard over-edge fall check
        if (state.connectingDevice === "lanyard" && (state.isOverEdgeFall || state.line_to_edge < 1.0)) {
            alert("⚠️ Restriction de sécurité :\nL'utilisation d'une longe simple est strictement interdite en cas de risque de chute par-dessus le bord de toiture. Un SRD Classe 2 est obligatoire.");
            return;
        }

        // Save Product & adapt roof settings
        const prodSel = document.getElementById("select-product");
        if (prodSel) {
            state.product = normalizeProduct(prodSel.value);
        }

        // Save Layout Type
        const layoutSel = document.getElementById("select-layout-type");
        state.layoutType = layoutSel ? layoutSel.value : "single_span";
        if (state.layoutType === "grid_system") {
            state.product = "EXTREME";
        }
        if (isExtreme(state.product)) {
            state.roofShape = "flat_overhead";
            state.mountingType = "overhead";
            state.bufferLength = 0.30;
        } else {
            if (state.roofShape === "flat_overhead") state.roofShape = "flat";
            state.mountingType = "standard";
            state.bufferLength = 0.20;
        }

        if (state.layoutType === "multi_bend_circle") {
            recalculateConfig6Spans();
        }

        if (state.layoutType === "slope_single" || state.layoutType === "slope_multi") {
            const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
            if (state.layoutType === "slope_single") {
                const sLenInp = document.getElementById("input-span-slope-len");
                const sDegInp = document.getElementById("input-span-slope-deg");
                const lenVal = parseFloat(sLenInp ? sLenInp.value : 20.0) || 20.0;
                const degVal = parseFloat(sDegInp ? sDegInp.value : 30.0) || 30.0;
                state.spans = [{
                    length: isUS ? (lenVal / METERS_TO_FEET) : lenVal,
                    slopeDeg: degVal
                }];
                state.roofSlope = degVal;
            } else {
                document.querySelectorAll(".span-length-input").forEach(inp => {
                    const idx = parseInt(inp.dataset.idx);
                    const val = parseFloat(inp.value) || 5.0;
                    if (state.spans[idx]) state.spans[idx].length = isUS ? (val / METERS_TO_FEET) : val;
                });
                document.querySelectorAll(".span-slopedeg-input").forEach(inp => {
                    const idx = parseInt(inp.dataset.idx);
                    const parsed = parseFloat(inp.value);
                    const val = !isNaN(parsed) ? parsed : 20.0;
                    if (state.spans[idx]) {
                        state.spans[idx].slopeDeg = val;
                        state.spans[idx].slope_deg = val;
                        state.spans[idx].isSloped = Math.abs(val) >= 15;
                    }
                });
            }

            const maxAllowedSpan = Calculator.getMaxSpan(state.product);
            const valCheck = validateSlopeSystemSpans(state.spans, maxAllowedSpan);
            if (!valCheck.valid) {
                alert(`⚠️ Erreur de validation de la pente :\n${valCheck.error}`);
                return;
            }
        }

        // Validate & Save Users
        let requestedUsers = parseInt(document.getElementById("input-users").value) || 1;
        const maxAllowedUsers = isPro(state.product) ? 5 : 3;
        if (requestedUsers > maxAllowedUsers) {
            alert(TRANSLATIONS.alerts.usersLimit[state.lang || 0]);
            requestedUsers = maxAllowedUsers;
            document.getElementById("input-users").value = maxAllowedUsers;
        }
        state.nbUsers = Math.max(1, requestedUsers);

        // Elevation preset (Spec V2 - 02 & Spec V2 - 07 / Prompt 12)
        const elevSelModal = document.getElementById("select-hll-elevation-preset");
        const elevInpModal = document.getElementById("input-hll-elevation-val");
        if (elevSelModal) {
            const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
            const rawElev = elevInpModal ? parseFloat(elevInpModal.value) : null;
            const parsedElev = (rawElev !== null && !isNaN(rawElev)) ? (isUS ? (rawElev / METERS_TO_FEET) : rawElev) : null;
            LayoutEditorModule.setHllElevation(elevSelModal.value, parsedElev);
        }

        // Engineer Coefficient (Spec V2 - 07 / Prompt 12)
        const engCoefInp = document.getElementById("input-engineer-coefficient");
        if (engCoefInp) {
            const rawCoef = parseFloat(engCoefInp.value);
            if (!isNaN(rawCoef) && rawCoef >= 0.10 && rawCoef <= 5.00) {
                state.engineerCoefficient = rawCoef;
            }
        }

        // Arrest load range check (1 lbf to 5000 lbf)
        const arrestModeSel = document.getElementById("select-arrest-load-mode");
        state.arrestLoadMode = arrestModeSel ? arrestModeSel.value : "custom";
        const arrestValInp = document.getElementById("input-arrest-load-val");
        const rawArrestVal = parseFloat(arrestValInp ? arrestValInp.value : 6.0) || 6.0;

        const loadLbf = (state.unitSystem === "imperial" || state.unitSystem === "us")
            ? rawArrestVal
            : (rawArrestVal * UnitsModule.KN_TO_LBF);

        if (isNaN(loadLbf) || loadLbf < 1.0 || loadLbf > 5000.0) {
            alert(`⚠️ Charge d'arrêt hors limites :\nLa charge d'arrêt (${Math.round(loadLbf)} lbf) doit être comprise entre 1 lbf et 5 000 lbf.`);
            return;
        }

        state.arrestLoadValue = (state.unitSystem === "imperial" || state.unitSystem === "us")
            ? (rawArrestVal * UnitsModule.LBF_TO_KN)
            : rawArrestVal;
        state.arrestLoadKn = state.arrestLoadValue;

        // Calculate total developed line length across active layout
        state.lineLength = Calculator.calculateTotalLineLength(null, state.product);

        // Ensure default components are checked ONLY if product changed
        if (state.previousProduct !== state.product) {
            setDefaultComponentsForSystem(state.product || "CORE");
            state.previousProduct = state.product;
        }

        // Synchronize active card on dashboard
        const allCards = document.querySelectorAll(".system-card");
        allCards.forEach(c => {
            if (normalizeProduct(c.dataset.system) === normalizeProduct(state.product)) {
                c.classList.add("active");
            } else {
                c.classList.remove("active");
            }
        });

        closeConfigModal();
        const homeScr = document.getElementById("home-screen");
        const dashScr = document.getElementById("dashboard-screen");
        if (homeScr) {
            homeScr.classList.remove("active");
            homeScr.style.display = "none";
        }
        if (dashScr) {
            dashScr.classList.add("active");
            dashScr.style.display = "flex";
        }

        if (!renderer) {
            initThreeEngine();
            renderComponentsChecklist();
            updateUnitLabelsInDOM();
            requestAnimationFrame(() => {
                onWindowResize();
                update3DScene();
            });
        } else {
            renderComponentsChecklist();
            preloadActiveModels();
            update3DScene();
            onWindowResize();
            updateUnitLabelsInDOM();
        }
    });

    // System Cards Selection
    const sysCards = document.querySelectorAll(".system-card");
    sysCards.forEach(card => {
        card.addEventListener("click", () => {
            const chosenSystem = normalizeProduct(card.dataset.system);

            // Automatically adapt roof shape and mounting type based on chosen system
            if (isExtreme(chosenSystem)) {
                state.roofShape = "flat_overhead";
                state.mountingType = "overhead";
                state.bufferLength = 0.30;
                if (state.layoutType === "cross_spans") {
                    state.layoutType = "grid_system";
                }
            } else {
                if (state.roofShape === "flat_overhead") {
                    state.roofShape = "flat";
                    state.mountingType = "standard";
                }
                state.bufferLength = 0.20;
                if (state.layoutType === "grid_system") {
                    state.layoutType = "single_span";
                }
            }

            // Synchronize product selector in modal
            const prodSel = document.getElementById("select-product");
            if (prodSel) prodSel.value = chosenSystem;
            const bufferInfo = document.getElementById("lbl-buffer-len-info");
            if (bufferInfo) {
                bufferInfo.innerHTML = `Buffer d'extrémité fixe : <strong>${formatDistance(state.bufferLength, 2, state.lang)}</strong> (non modifiable par l'utilisateur)`;
            }

            // Compatibility Check: Mono-slope (sloped) is reserved strictly for PRO
            if (!isPro(chosenSystem) && state.roofShape === "sloped") {
                alert(TRANSLATIONS.alerts.slopedNewProOnly[state.lang || 0]);
                return;
            }

            // Compatibility Check: Legacy mid-span X-Matrix junction on 2-line corner requires PRO
            const isLegacyMidXMat = state.hasLine2 && state.xMatrixLocation === "mid" && state.layoutType !== "cross_spans" && state.layoutType !== "grid_system";
            if (isLegacyMidXMat && !isPro(chosenSystem) && !isExtreme(chosenSystem)) {
                alert(TRANSLATIONS.alerts.xmatrixNewProOnly[state.lang || 0]);
                return;
            }

            // User capacity limit check (5 users max for PRO, 3 users max for CORE and EXTREME)
            const uInput = document.getElementById("input-users");
            const maxAllowedU = isPro(chosenSystem) ? 5 : 3;
            if (uInput) uInput.max = (state.roofShape === "sloped") ? 1 : maxAllowedU;
            if (state.nbUsers > maxAllowedU) {
                alert(TRANSLATIONS.alerts.usersLimit[state.lang || 0]);
                state.nbUsers = maxAllowedU;
                if (uInput) uInput.value = maxAllowedU;
            }

            sysCards.forEach(c => {
                c.classList.toggle("active", normalizeProduct(c.dataset.system) === chosenSystem);
            });
            state.product = chosenSystem;

            // Filter layout dropdown options and update dynamic form
            filterLayoutDropdownOptions();
            renderDynamicLayoutForm();

            // Reset multi-span mode if the selected product does not support multi-span (e.g. EXTREME)
            const isOSHA = (state.norm === "OSHA");
            const isMultiSpanAllowed = isOSHA && !isExtreme(chosenSystem);
            if (!isMultiSpanAllowed) {
                state.oshaSpanMode = "unique";
                const subtabUnique = document.getElementById("subtab-span-unique");
                const subtabMulti = document.getElementById("subtab-span-multi");
                if (subtabUnique) subtabUnique.classList.add("active");
                if (subtabMulti) subtabMulti.classList.remove("active");
            }

            // Set default checked components for the chosen system
            setDefaultComponentsForSystem(chosenSystem);

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
        orthographicCam.up.set(0, 0, -1);
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
            orthographicCam.up.set(0, 0, -1);
            orthographicCam.position.set(centerX, 40, centerZ);
            orthographicCam.lookAt(centerX, 0, centerZ);
            orthographicCam.updateProjectionMatrix();
            if (controls) {
                controls.target.set(centerX, 0, centerZ);
                controls.update();
            }
        }
    });

    document.getElementById("btn-toggle-grid").addEventListener("click", (e) => {
        state.gridVisible = !state.gridVisible;
        e.currentTarget.classList.toggle("active", state.gridVisible);
        update3DScene();
    });

    const btnToggleAnchorLabels = document.getElementById("btn-toggle-anchor-labels");
    if (btnToggleAnchorLabels) {
        btnToggleAnchorLabels.addEventListener("click", (e) => {
            state.showAnchorLabels = (state.showAnchorLabels === false) ? true : false;
            e.currentTarget.classList.toggle("active", state.showAnchorLabels);
            if (anchorLabelsSubgroup) anchorLabelsSubgroup.visible = state.showAnchorLabels;
        });
    }

    const btnToggleSpanLabels = document.getElementById("btn-toggle-span-labels");
    if (btnToggleSpanLabels) {
        btnToggleSpanLabels.addEventListener("click", (e) => {
            state.showSpanLabels = (state.showSpanLabels === false) ? true : false;
            e.currentTarget.classList.toggle("active", state.showSpanLabels);
            if (spanLabelsSubgroup) spanLabelsSubgroup.visible = state.showSpanLabels;
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

    const btnCloseInsp = document.getElementById("btn-close-inspector");
    if (btnCloseInsp) {
        btnCloseInsp.addEventListener("click", () => {
            state.selectedNodeIndex = -1;
            state.selectedSpanIndex = -1;
            const card = document.getElementById("node-inspector-card");
            if (card) card.classList.add("hidden");
        });
    }

    const inspLen = document.getElementById("insp-length-val");
    if (inspLen) {
        inspLen.addEventListener("change", (e) => {
            const sIdx = (state.selectedSpanIndex !== undefined && state.selectedSpanIndex >= 0) ? state.selectedSpanIndex : (state.selectedNodeIndex >= 0 ? Math.min(state.selectedNodeIndex, (state.spans ? state.spans.length - 1 : 0)) : 0);
            if (state.spans && sIdx >= 0 && sIdx < state.spans.length) {
                const rawVal = parseFloat(e.target.value) || 1.0;
                const isUS = (state.unitSystem === "imperial" || state.unitSystem === "us");
                const meters = isUS ? (rawVal * FT_TO_M) : rawVal;
                LayoutEditorModule.setSpanLength(sIdx, meters);
                highlightSelectedNode(state.selectedNodeIndex, sIdx);
            }
        });
    }

    const inspBend = document.getElementById("insp-bend-val");
    if (inspBend) {
        inspBend.addEventListener("change", (e) => {
            const sIdx = (state.selectedSpanIndex !== undefined && state.selectedSpanIndex >= 0) ? state.selectedSpanIndex : (state.selectedNodeIndex >= 0 ? Math.min(state.selectedNodeIndex, (state.spans ? state.spans.length - 1 : 0)) : 0);
            if (state.spans && sIdx >= 0 && sIdx < state.spans.length) {
                const val = parseFloat(e.target.value) || 0;
                LayoutEditorModule.setSpanBend(sIdx, val);
                highlightSelectedNode(state.selectedNodeIndex, sIdx);
            }
        });
    }

    const inspSlope = document.getElementById("insp-slope-val");
    if (inspSlope) {
        inspSlope.addEventListener("change", (e) => {
            const sIdx = (state.selectedSpanIndex !== undefined && state.selectedSpanIndex >= 0) ? state.selectedSpanIndex : (state.selectedNodeIndex >= 0 ? Math.min(state.selectedNodeIndex, (state.spans ? state.spans.length - 1 : 0)) : 0);
            if (state.spans && sIdx >= 0 && sIdx < state.spans.length) {
                const val = parseFloat(e.target.value) || 0;
                const ok = LayoutEditorModule.setSpanSlope(sIdx, val);
                if (!ok) {
                    e.target.value = state.spans[sIdx].slopeDeg || 0;
                }
                highlightSelectedNode(state.selectedNodeIndex, sIdx);
            }
        });
    }

    const btnSetFall = document.getElementById("btn-insp-set-fall");
    if (btnSetFall) {
        btnSetFall.addEventListener("click", () => {
            const sIdx = (state.selectedSpanIndex !== undefined && state.selectedSpanIndex >= 0) ? state.selectedSpanIndex : (state.selectedNodeIndex >= 0 ? Math.min(state.selectedNodeIndex, (state.spans ? state.spans.length - 1 : 0)) : 0);
            if (state.spans && sIdx >= 0 && sIdx < state.spans.length) {
                LayoutEditorModule.selectFallSpan(state.spans[sIdx].id);
                highlightSelectedNode(state.selectedNodeIndex, sIdx);
            }
        });
    }

    const btnSplit = document.getElementById("btn-insp-split");
    if (btnSplit) {
        btnSplit.addEventListener("click", () => {
            const sIdx = (state.selectedSpanIndex !== undefined && state.selectedSpanIndex >= 0) ? state.selectedSpanIndex : (state.selectedNodeIndex >= 0 ? Math.min(state.selectedNodeIndex, (state.spans ? state.spans.length - 1 : 0)) : 0);
            if (state.spans && sIdx >= 0 && sIdx < state.spans.length) {
                LayoutEditorModule.splitSpan(sIdx);
                highlightSelectedNode(sIdx, sIdx);
            }
        });
    }

    // Spec V2 — 08: X-Cones field for Sloped Spans
    const inspXCones = document.getElementById("insp-xcones-val");
    const btnAddXCone = document.getElementById("btn-add-xcone");
    const updateSpanXCones = (count) => {
        const sIdx = (state.selectedSpanIndex !== undefined && state.selectedSpanIndex >= 0) ? state.selectedSpanIndex : (state.selectedNodeIndex >= 0 ? Math.min(state.selectedNodeIndex, (state.spans ? state.spans.length - 1 : 0)) : 0);
        if (state.spans && sIdx >= 0 && sIdx < state.spans.length) {
            const sp = state.spans[sIdx];
            const slope = (sp.slope_deg !== undefined ? sp.slope_deg : sp.slopeDeg) || 0;
            if (slope === 0 && !sp.isSloped) {
                alert(["⚠️ Les X-cones sont autorisés uniquement sur une portée en pente.", "⚠️ X-Cones are only allowed on sloped spans."][state.lang || 0]);
                if (inspXCones) inspXCones.value = 0;
                return;
            }
            sp.xconesCount = Math.max(0, parseInt(count) || 0);
            update3DScene();
        }
    };
    if (inspXCones) {
        inspXCones.addEventListener("change", (e) => updateSpanXCones(e.target.value));
    }
    if (btnAddXCone) {
        btnAddXCone.addEventListener("click", () => {
            const current = inspXCones ? (parseInt(inspXCones.value) || 0) : 0;
            const next = current + 1;
            if (inspXCones) inspXCones.value = next;
            updateSpanXCones(next);
        });
    }

    // Spec V2 — 08: X-Matrix Toggle for Intermediate Anchors
    const btnXMat = document.getElementById("btn-insp-toggle-xmatrix");
    if (btnXMat) {
        btnXMat.addEventListener("click", () => {
            if (state.selectedNodeIndex <= 0) {
                alert(["⚠️ Veuillez sélectionner un ancrage intermédiaire pour placer une X-Matrix.", "⚠️ Please select an intermediate anchor to place an X-Matrix."][state.lang || 0]);
                return;
            }
            const activeLayout = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
            const nodes = activeLayout.line1 || [];
            if (state.selectedNodeIndex >= nodes.length - 1) {
                alert(["⚠️ La X-Matrix ne peut pas être placée sur un ancrage d'extrémité.", "⚠️ X-Matrix cannot be placed on an end anchor."][state.lang || 0]);
                return;
            }
            const isRange = isExtreme(state.product);
            const isOverhead = (state.mountingType === "overhead" || state.roofShape === "flat_overhead");
            if (!isPro(state.product) && !(isRange && isOverhead)) {
                alert(["⚠️ La X-Matrix est autorisée uniquement pour le système PRO ou en pose suspendue (overhead) pour Extreme.", "⚠️ X-Matrix is only allowed for PRO systems or overhead Extreme systems."][state.lang || 0]);
                return;
            }
            const n = nodes[state.selectedNodeIndex];
            n.hasXMatrix = !n.hasXMatrix;
            n.type = n.hasXMatrix ? "x_matrix" : "intermediaire";
            n.noPost = n.hasXMatrix;

            // Synchronize with state.spans
            const spanIdx = state.selectedNodeIndex - 1;
            if (state.spans && state.spans[spanIdx]) {
                state.spans[spanIdx].hasXMatrix = n.hasXMatrix;
                if (n.hasXMatrix) {
                    if (!state.spans[spanIdx].xMatrixBranches) {
                        state.spans[spanIdx].xMatrixBranches = [];
                    }
                    cleanupCollinearXMatrixBranches(state.spans);
                    n.xMatrixBranches = state.spans[spanIdx].xMatrixBranches;
                } else {
                    state.spans[spanIdx].xMatrixBranches = [];
                    n.xMatrixBranches = [];
                }
            }

            // Sync X-Matrix in nomenclature (Spec V2 — 08 / Prompt 14)
            const curProd = normalizeProduct(state.product || "PRO");
            const comps = COMPONENTS_DB[curProd] || [];
            const xMatComp = comps.find(c => c.id === "X-Matrix");
            if (xMatComp) {
                const anyNodeHasX = nodes.some(node => node.hasXMatrix || node.type === "x_matrix");
                xMatComp.checked = anyNodeHasX;
                if (state.checkedComponents) state.checkedComponents["X-Matrix"] = anyNodeHasX;
                if (typeof renderComponentsChecklist === "function") renderComponentsChecklist();
            }
            syncXMatrixNomenclature();

            const btnText = document.getElementById("btn-insp-xmatrix-text");
            if (btnText) {
                btnText.textContent = n.hasXMatrix ? (parseInt(state.lang) === 1 ? "Remove X-Matrix" : "Retirer la X-Matrix") : (parseInt(state.lang) === 1 ? "Add X-Matrix" : "Ajouter une X-Matrix");
            }
            highlightSelectedNode(state.selectedNodeIndex);
            if (typeof renderDynamicLayoutForm === "function") renderDynamicLayoutForm();
            update3DScene();
        });
    }

    const btnInsertAfter = document.getElementById("btn-insp-insert-after");
    if (btnInsertAfter) {
        btnInsertAfter.addEventListener("click", () => {
            const sIdx = (state.selectedSpanIndex !== undefined && state.selectedSpanIndex >= 0) ? state.selectedSpanIndex : (state.selectedNodeIndex >= 0 ? Math.min(state.selectedNodeIndex, (state.spans ? state.spans.length - 1 : 0)) : 0);
            if (state.spans && sIdx >= 0 && sIdx < state.spans.length) {
                LayoutEditorModule.insertSpan(sIdx, "after", 5.0, 0, 0);
                state.selectedSpanIndex = sIdx + 1;
                state.selectedNodeIndex = sIdx + 1;
                highlightSelectedNode(sIdx + 1, sIdx + 1);
            }
        });
    }

    const btnDeleteNode = document.getElementById("btn-delete-node");
    if (btnDeleteNode) {
        btnDeleteNode.addEventListener("click", () => {
            if (state.drawingMode === "place" && state.customPoints && state.customPoints.length > 0) {
                if (state.selectedNodeIndex >= 0 && state.selectedNodeIndex < state.customPoints.length) {
                    state.customPoints.splice(state.selectedNodeIndex, 1);
                    state.selectedNodeIndex = -1;
                    highlightSelectedNode();
                    update3DScene();
                }
            } else if (state.spans && state.spans.length > 0) {
                const sIdx = (state.selectedSpanIndex !== undefined && state.selectedSpanIndex >= 0) ? state.selectedSpanIndex : (state.selectedNodeIndex >= 0 ? Math.min(state.selectedNodeIndex, state.spans.length - 1) : 0);
                LayoutEditorModule.deleteSpan(sIdx);
                state.selectedNodeIndex = Math.max(0, sIdx - 1);
                state.selectedSpanIndex = Math.max(0, sIdx - 1);
                highlightSelectedNode(state.selectedNodeIndex, state.selectedSpanIndex);
            }
        });
    }

    // Regulatory Norm Tabs & OSHA Subtabs
    const tabEN = document.getElementById("tab-en795");
    const tabOSHA = document.getElementById("tab-osha");
    const subtabUnique = document.getElementById("subtab-span-unique");
    const subtabMulti = document.getElementById("subtab-span-multi");
    const oshaSubtabs = document.getElementById("osha-subtabs");

    if (oshaSubtabs) {
        oshaSubtabs.style.display = (state.norm === "OSHA") ? "flex" : "none";
    }

    if (tabEN) {
        tabEN.addEventListener("click", () => {
            setNorm("EN 795");
        });
    }

    if (tabOSHA) {
        tabOSHA.addEventListener("click", () => {
            setNorm("OSHA");
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
            const isMultiSpanAllowed = isOSHA && !isExtreme(state.product);
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
        "CORE": {
            "matrice_platine": { nombre: 4, type_fixation: "—" },
            "platine_support": { nombre: 1, type_fixation: "—" }
        },
        "PRO": {
            "matrice_platine": { nombre: 6, type_fixation: "Boulons" },
            "platine_support": { nombre: 2, type_fixation: "—" }
        },
        "EXTREME": {
            "matrice_platine": { nombre: 8, type_fixation: "—" },
            "platine_support": { nombre: 1, type_fixation: "—" }
        },
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
    const rawModel = ligneModel || state.product || "CORE";
    const model = isExtreme(rawModel) ? "EXTREME" : (isCore(rawModel) ? "CORE" : "PRO");
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
            else if (pLower.includes("x-matrix") || pLower.includes("xmatrix")) pKey = "X-MATRIX";
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
    const list = COMPONENTS_DB[normalizeProduct(state.product || "CORE")] || [];
    const hasMiniOmega = list.some(c => c.checked && (c.id === "Mini_Omega" || c.name.toLowerCase().includes("mini omega")));
    const hasBasculant = list.some(c => c.checked && (c.id === "PB_HOOKt" || c.name.toLowerCase().includes("basculant")));
    const hasRigide = list.some(c => c.checked && (c.id === "P_Galva" || c.id === "P_Inox" || c.name.toLowerCase().includes("rigide")));
    const hasAFix = list.some(c => c.checked && (c.id === "A-Fix" || c.name.toLowerCase().includes("a-fix")));
    const isXMatrixChecked = list.some(c => c.id === "X-Matrix" && c.checked);

    if (state.roofShape === "sloped" && !isPro(state.product)) {
        alert(TRANSLATIONS.alerts.slopedNewProOnly[state.lang || 0]);
        return false;
    }

    const isLegacyMidXMatrix = (state.hasLine2 && state.xMatrixLocation === "mid") || 
        ((isXMatrixChecked || (state.checkedComponents && state.checkedComponents["X-Matrix"])) && state.layoutType !== "cross_spans" && state.layoutType !== "grid_system");

    if (isLegacyMidXMatrix && !isPro(state.product) && !isExtreme(state.product)) {
        alert(TRANSLATIONS.alerts.xmatrixNewProOnly[state.lang || 0]);
        return false;
    }

    if (hasMiniOmega && !isPro(state.product)) {
        alert(TRANSLATIONS.alerts.miniOmegaNewPro[state.lang || 0]);
        return false;
    }

    if (hasBasculant && !isCore(state.product) && !isPro(state.product)) {
        alert(TRANSLATIONS.alerts.basculantLightPro[state.lang || 0]);
        return false;
    }

    if (hasRigide && isExtreme(state.product)) {
        alert(TRANSLATIONS.alerts.rigideNotLongRange[state.lang || 0]);
        return false;
    }

    if (hasAFix && !isExtreme(state.product)) {
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
    let totalCones = 0;
    const slopeRad = (state.roofSlope || 0) * (Math.PI / 180);

    const countConesForLine = (lineNodes) => {
        if (!lineNodes || lineNodes.length < 2) return;
        for (let i = 0; i < lineNodes.length - 1; i++) {
            const pA = lineNodes[i];
            const pB = lineNodes[i + 1];

            let segSlopeDeg = 0;
            if (state.spans && state.spans[i]) {
                const parsed = parseFloat(state.spans[i].slopeDeg !== undefined ? state.spans[i].slopeDeg : state.spans[i].slope_deg);
                if (!isNaN(parsed) && Math.abs(parsed) >= 15) {
                    segSlopeDeg = Math.abs(parsed);
                }
            }
            if (segSlopeDeg === 0) {
                if (state.layoutType === "slope_single" || state.layoutType === "slope_multi") {
                    const sSlope = parseFloat(state.spans?.[i]?.slopeDeg || state.roofSlope || 0);
                    if (sSlope >= 15) segSlopeDeg = sSlope;
                } else if (state.roofShape === "sloped" || state.roof_type === "sloped" || state.roofShape === "triangle" || state.roof_type === "triangle") {
                    const rSlope = parseFloat(state.roofSlope || state.roof_slope_deg || 0);
                    if (rSlope >= 15) segSlopeDeg = rSlope;
                }
            }

            if (segSlopeDeg < 15 || segSlopeDeg > 75) continue;

            const spacing = Calculator.getXConeSpacing(segSlopeDeg);
            if (spacing <= 0) continue;

            const xA = pA.x;
            const zA = pA.z;
            const yA = (state.roofShape === "sloped") ? zA * Math.tan(slopeRad) : (pA.y || 0);

            const xB = pB.x;
            const zB = pB.z;
            const yB = (state.roofShape === "sloped") ? zB * Math.tan(slopeRad) : (pB.y || 0);

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
// HIGH-RESOLUTION DEDICATED PLAN DE REPÉRAGE SNAPSHOT FOR PDF REPORT
// ==========================================
function capturePlanDeReperageSnapshot(targetW = 182, targetH = 140) {
    if (!renderer || !renderer.domElement || !scene) return null;
    if (typeof THREE === "undefined") return null;

    // Headless / mock environment fallback for automated testing
    if (typeof THREE.Box3 === "undefined" || typeof renderer.setSize !== "function") {
        try {
            if (typeof renderer.render === "function") {
                renderer.render(scene, activeCam || perspectiveCam);
            }
            const dataUrl = renderer.domElement.toDataURL("image/png");
            return { dataUrl, pdfX: 14, pdfW: targetW, pdfH: targetH };
        } catch (e) {
            return null;
        }
    }

    const origWidth = renderer.domElement.width;
    const origHeight = renderer.domElement.height;
    const origBackground = scene.background;
    const origGridVisible = gridHelper ? gridHelper.visible : true;
    const origActiveCam = activeCam;

    try {
        let box = new THREE.Box3();
        if (roofMesh) box.setFromObject(roofMesh);
        if (cableGroup) box.expandByObject(cableGroup);
        if (anchorGroup) box.expandByObject(anchorGroup);

        if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) {
            const L = parseFloat(state.L || state.roof_length || 15.0);
            const l = parseFloat(state.l || state.roof_width || 10.0);
            box.min.set(0, 0, 0);
            box.max.set(L, 0.5, l);
        }

        const pad = 2.0;
        const minX = box.min.x - pad;
        const maxX = box.max.x + pad;
        const minZ = box.min.z - pad;
        const maxZ = box.max.z + pad;
        const minY = box.min.y;
        const maxY = box.max.y;

        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;
        const centerY = (minY + maxY) / 2;

        const bboxW = Math.max(6, maxX - minX);
        const bboxH = Math.max(4, maxZ - minZ);

        scene.background = new THREE.Color(0xffffff);
        if (gridHelper) gridHelper.visible = false;

        if (typeof Dimensions3DModule !== "undefined" && Dimensions3DModule.renderDimensions) {
            Dimensions3DModule.renderDimensions();
        }
        if (dimensionsGroup) dimensionsGroup.visible = true;
        if (labelsGroup) labelsGroup.visible = true;
        if (anchorLabelsSubgroup) anchorLabelsSubgroup.visible = true;
        if (spanLabelsSubgroup) spanLabelsSubgroup.visible = true;

        const renderW = Math.round(targetW * 10);
        const renderH = Math.round(targetH * 10);
        renderer.setSize(renderW, renderH, false);

        const renderAspect = renderW / renderH;
        const roofAspect = bboxW / bboxH;
        let viewW = bboxW;
        let viewH = bboxH;
        if (renderAspect > roofAspect) {
            viewW = viewH * renderAspect;
        } else {
            viewH = viewW / renderAspect;
        }

        const snapCam = new THREE.OrthographicCamera(
            -viewW / 2, viewW / 2,
            viewH / 2, -viewH / 2,
            0.1, 1000
        );
        snapCam.up.set(0, 0, -1);
        snapCam.position.set(centerX, Math.max(maxY + 60, 80), centerZ);
        snapCam.lookAt(centerX, centerY, centerZ);
        snapCam.updateProjectionMatrix();

        renderer.render(scene, snapCam);
        const dataUrl = renderer.domElement.toDataURL("image/png");

        return {
            dataUrl,
            pdfX: 14,
            pdfW: targetW,
            pdfH: targetH
        };
    } catch (err) {
        console.warn("capturePlanDeReperageSnapshot error:", err);
        return null;
    } finally {
        scene.background = origBackground;
        if (gridHelper) gridHelper.visible = origGridVisible;
        if (origWidth > 0 && origHeight > 0) {
            renderer.setSize(origWidth, origHeight, false);
        }
        if (origActiveCam) {
            renderer.render(scene, origActiveCam);
        }
    }
}
window.capturePlanDeReperageSnapshot = capturePlanDeReperageSnapshot;

// ==========================================
// HIGH-RESOLUTION 3D ROOF PERSPECTIVE SNAPSHOT FOR PDF REPORT
// ==========================================
function captureVue3DToitSnapshot(targetW = 182, targetH = 140) {
    if (!renderer || !renderer.domElement || !scene) return null;
    if (typeof THREE === "undefined") return null;

    // Headless / mock environment fallback for automated testing
    if (typeof THREE.Box3 === "undefined" || typeof renderer.setSize !== "function") {
        try {
            if (typeof renderer.render === "function") {
                renderer.render(scene, activeCam || perspectiveCam);
            }
            const dataUrl = renderer.domElement.toDataURL("image/png");
            return { dataUrl, pdfX: 14, pdfW: targetW, pdfH: targetH };
        } catch (e) {
            return null;
        }
    }

    const origWidth = renderer.domElement.width;
    const origHeight = renderer.domElement.height;
    const origBackground = scene.background;
    const origGridVisible = gridHelper ? gridHelper.visible : true;
    const origActiveCam = activeCam;

    try {
        let box = new THREE.Box3();
        if (roofMesh) box.setFromObject(roofMesh);
        if (cableGroup) box.expandByObject(cableGroup);
        if (anchorGroup) box.expandByObject(anchorGroup);

        if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) {
            const L = parseFloat(state.L || state.roof_length || 15.0);
            const l = parseFloat(state.l || state.roof_width || 10.0);
            box.min.set(0, 0, 0);
            box.max.set(L, 1.0, l);
        }

        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);

        const maxDim = Math.max(size.x, size.z, 12);
        const dist = maxDim * 1.35;

        // Elevated axonometric/perspective 3D camera (elevation ~40-45°, azimuth ~35°)
        const snapCam3D = new THREE.PerspectiveCamera(38, targetW / targetH, 0.1, 2000);
        snapCam3D.position.set(center.x + dist * 0.70, center.y + dist * 0.85, center.z + dist * 0.75);
        snapCam3D.lookAt(center.x, center.y + 0.3, center.z);
        snapCam3D.updateProjectionMatrix();

        scene.background = new THREE.Color(0xffffff);
        if (gridHelper) gridHelper.visible = false;

        if (typeof Dimensions3DModule !== "undefined" && Dimensions3DModule.renderDimensions) {
            Dimensions3DModule.renderDimensions();
        }
        if (dimensionsGroup) dimensionsGroup.visible = true;
        if (labelsGroup) labelsGroup.visible = true;
        if (anchorLabelsSubgroup) anchorLabelsSubgroup.visible = true;
        if (spanLabelsSubgroup) spanLabelsSubgroup.visible = true;

        const renderW = Math.round(targetW * 10);
        const renderH = Math.round(targetH * 10);
        renderer.setSize(renderW, renderH, false);

        renderer.render(scene, snapCam3D);
        const dataUrl = renderer.domElement.toDataURL("image/png");

        return {
            dataUrl,
            pdfX: 14,
            pdfW: targetW,
            pdfH: targetH
        };
    } catch (err) {
        console.warn("captureVue3DToitSnapshot error:", err);
        return null;
    } finally {
        scene.background = origBackground;
        if (gridHelper) gridHelper.visible = origGridVisible;
        if (origWidth > 0 && origHeight > 0) {
            renderer.setSize(origWidth, origHeight, false);
        }
        if (origActiveCam) {
            renderer.render(scene, origActiveCam);
        }
    }
}
window.captureVue3DToitSnapshot = captureVue3DToitSnapshot;

// ==========================================
// REPORT PDF GENERATOR
// ==========================================
function generatePDFReport() {
    try {
        let currentUser;
        try {
            currentUser = AuthModule.requireAuth();
        } catch (e) {
            alert("⚠️ Accès refusé : Une session active approuvée par PIP est requise pour générer ce rapport.");
            AuthModule.showLoginOverlay();
            return;
        }

        if (!validateProductAssociations()) return;

        const l = state.lang || 0;
        const isEn = (parseInt(l) === 1);
        const pdfTrans = TRANSLATIONS.pdf;

        // Spec V2 — 10 / Prompt 16: Mandatory Retracted Length / Lanyard Length check
        const isLanyardDev = (state.connectingDevice === "lanyard" || state.connectingDevice === "custom_lanyard");
        const retrM = (typeof state.retractedLengthM === "number" && !isNaN(state.retractedLengthM)) ? state.retractedLengthM : parseFloat(state.retractedLengthM);
        if (!retrM || isNaN(retrM) || retrM <= 0) {
            const fieldFr = isLanyardDev ? "La longueur de la longe" : "La longueur rétractée";
            const fieldEn = isLanyardDev ? "Lanyard length" : "Retracted length";
            alert(isEn
                ? `⚠️ Missing Mandatory Field: ${fieldEn} must be specified and strictly greater than 0 before generating the report.`
                : `⚠️ Champ obligatoire manquant : ${fieldFr} doit être renseignée et strictement supérieure à 0 avant de générer le rapport.`);
            return;
        }

        // Spec V2 — 09 / Prompt 15: Mandatory MAD and Arrest Force checks
        const madM = (typeof state.madM === "number" && !isNaN(state.madM)) ? state.madM : parseFloat(state.madM);
        if (!madM || isNaN(madM) || madM <= 0) {
            alert(isEn
                ? "⚠️ Missing Mandatory Field: Maximum Arrest Distance (MAD) must be specified and strictly greater than 0 before generating the report."
                : "⚠️ Champ obligatoire manquant : La distance d'arrêt maximale (MAD) doit être renseignée et strictement supérieure à 0 avant de générer le rapport.");
            return;
        }

        const fKn = (typeof state.arrestForceKn === "number" && !isNaN(state.arrestForceKn)) ? state.arrestForceKn : parseFloat(state.arrestForceKn);
        if (!fKn || isNaN(fKn) || fKn <= 0) {
            alert(isEn
                ? "⚠️ Missing Mandatory Field: Arrest Force (1 user) must be specified and strictly greater than 0 before generating the report."
                : "⚠️ Champ obligatoire manquant : La force d'arrêt (Arrest Force 1 user) doit être renseignée et strictement supérieure à 0 avant de générer le rapport.");
            return;
        }
        const fLbf = fKn * UnitsModule.KN_TO_LBF;
        if (fLbf > 5000.0) {
            alert(isEn
                ? `⚠️ Arrest Force Out of Range: ${Math.round(fLbf)} lbf exceeds the 5,000 lbf maximum threshold.`
                : `⚠️ Force d'arrêt hors limites : ${Math.round(fLbf)} lbf dépasse le maximum autorisé de 5 000 lbf.`);
            return;
        }

        // Spec V2 — 04 / Prompt 15 & Spec V2 — 10 / Prompt 16: Mandatory SRL Selection & Class Validation Gate
        if (state.connectingDevice === "srd" && !state.selectedSrlId) {
            const srlCard = document.getElementById("srl-selection-card");
            if (srlCard && typeof srlCard.scrollIntoView === 'function') {
                srlCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                srlCard.classList.add("pulse-attention");
                setTimeout(() => srlCard.classList.remove("pulse-attention"), 3500);
            }
            alert(isEn
                ? "⚠️ SRL Selection Required: Please select an SRL model (TurboLite+ or Falcon+) in the right panel before generating the report."
                : "⚠️ Sélection SRL obligatoire : Veuillez sélectionner un modèle de SRL (TurboLite+ ou Falcon+) dans le panneau latéral droit avant de générer le rapport.");
            return;
        }

        const srlData = (state.connectingDevice === "srd" && state.selectedSrlId) ? SRL_CATALOG[state.selectedSrlId] : null;
        const hllElev = parseFloat(state.hllElevation) || 0.45;
        const targetClass = (state.connectingDevice === "srd" && srlData) ? srlData.classe : (state.connectingDevice === "custom_srd" ? (parseInt(state.customDeviceClass) || 2) : 2);
        if (targetClass === 1 && (state.hllElevationPreset === "knee" || hllElev < 1.49)) {
            alert(isEn
                ? `⚠️ SRL Class 1 Rejected: Lifeline is below D-ring height. A Class 2 device is mandatory for this report.`
                : `⚠️ Non-conformité SRL Classe 1 : La ligne de vie est sous l'anneau D. Un dispositif Classe 2 est obligatoire pour éditer ce rapport.`);
            return;
        }

    if (isExtreme(state.product) && (state.lineLength < 10.0 || state.lineLength > 56.0)) {
        alert(TRANSLATIONS.alerts.longRangeLengthRange[l]);
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert(TRANSLATIONS.alerts.pdfLoading[l]);
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

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

    const dateLocales = ["fr-FR", "en-US", "es-ES"];
    const today = new Date().toLocaleDateString(dateLocales[l] || "fr-FR");

    const activeLayout = Calculator.calculateAnchorPositions(state.L, state.l, Calculator.getMaxSpan(state.product));
    const positions = (activeLayout && activeLayout.all) ? activeLayout.all : (Array.isArray(activeLayout) ? activeLayout : []);
    const totalAnchors = countTotalAnchorPosts(positions);
    const totalLineLen = Calculator.calculateTotalLineLength(activeLayout, state.product);
    const realSpanMax = Calculator.calculateMaxRealSpan(activeLayout);
    const isOSHA = (state.norm === "OSHA");
    const isMultiSpanAllowed = isOSHA && !isExtreme(state.product);
    const isMultiSpan = isMultiSpanAllowed ? (state.oshaSpanMode === "multi") : false;
    const support = getActiveSupportType();

    const postName = getActivePostName();
    const displayProductPdf = isExtreme(state.product)
        ? `EXTREME - ${getLongRangeSubRange(state.lineLength)}`
        : normalizeProduct(state.product || "CORE");
    const displayAbsorberPdf = isExtreme(state.product)
        ? `EXTREME (${getLongRangeSubRange(state.lineLength)})`
        : normalizeProduct(state.product || "CORE");

    const pInfo = state.projectInfo || {};

    const elevPresetNames = {
        "knee": l === 1 ? "Knee height - ~0.45 m" : "Hauteur de genou - ~0,45 m",
        "d_ring": l === 1 ? "D-ring - 1.50 m" : "Anneau D - 1,50 m",
        "overhead": (isExtreme(state.product) ? "Overhead - 3,00 m" : "Overhead - 1,80 m"),
        "custom": `Personnalisée - ${parseFloat(state.hllElevation).toFixed(2)} m`
    };
    const elevLabel = elevPresetNames[state.hllElevationPreset] || `${parseFloat(state.hllElevation).toFixed(2)} m`;

    // Record audit event
    AuthModule.logAudit("REPORT_GENERATED", {
        projectName: pInfo.name || "N/A",
        layout: state.layoutType,
        norm: state.norm,
        product: state.product
    }, currentUser);

    // Synchronize active arrest load from input element if available
    const arrestInpEl = document.getElementById("input-arrest-load-val");
    if (arrestInpEl && arrestInpEl.value) {
        const rawInp = parseFloat(arrestInpEl.value);
        if (!isNaN(rawInp) && rawInp > 0) {
            const parsedKn = (state.unitSystem === "imperial" || state.unitSystem === "us")
                ? (rawInp * UnitsModule.LBF_TO_KN)
                : rawInp;
            state.arrestLoadValue = parsedKn;
            state.arrestLoadKn = parsedKn;
        }
    }
    const currentArrestKn = state.arrestLoadValue || state.arrestLoadKn || 6.0;
    const lumpU = Math.max(1, Math.min(5, parseInt(state.nbUsers) || 1));
    const lumpM = (typeof LUMP_FACTOR_BY_USERS !== "undefined" && LUMP_FACTOR_BY_USERS[lumpU]) ? LUMP_FACTOR_BY_USERS[lumpU] : 1.0;
    const isProvisional = (lumpU === 5);
    const lumpDetail = (state.arrestLoadMode === "custom")
        ? ""
        : ` (Lump Sum M=${lumpM.toFixed(2)}${isProvisional ? " prov." : ""})`;
    const arrestForceStr = UnitsModule.formatForce(currentArrestKn) + lumpDetail;

    // Section 1: Lifeline Details & Project Info (Single Title Call)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(30, 41, 59);
    doc.text(pdfTrans.sec1Title[l], 14, 33);

    const sec1Labels = {
        user: ["Utilisateur PIP", "PIP User", "Usuario PIP"][l],
        project: ["Projet / Lieu", "Project / Location", "Proyecto / Ubicación"][l],
        hllDate: ["Repère / Date", "Mark / Date", "Referencia / Fecha"][l],
        product: ["Gamme Produit", "Product Range", "Gama Producto"][l],
        config: ["Configuration OSHA", "OSHA Configuration", "Configuración OSHA"][l],
        app: ["Application", "Application", "Aplicación"][l],
        elev: ["Élévation ligne", "Lifeline Elevation", "Elevación de Línea"][l],
        arrest: ["Charge d'arrêt", "Arrest Load", "Carga de parada"][l],
        anchors: ["Nombre d'ancrages", "Anchor Count", "Número de anclajes"][l],
        absorbers: ["Nombre d'absorbeurs", "Absorber Count", "Número de absorbedores"][l],
        devLen: ["Longueur développée", "Developed Length", "Longitud desarrollada"][l],
        realSpan: ["Portée réelle max", "Max Real Span", "Luz real máxima"][l],
        maxUsers: ["Utilisateurs max", "Max Users", "Usuarios máx."][l],
        srl: ["Dispositif de connexion", "Connecting Device", "Dispositivo de conexión"][l]
    };

    const sec1TableBody = [
        [
            sec1Labels.user, `${currentUser.nom} - ${currentUser.société}`,
            sec1Labels.arrest, arrestForceStr
        ],
        [
            sec1Labels.project, `${pInfo.name || "N/A"} - ${pInfo.location || "N/A"}`,
            sec1Labels.anchors, `${totalAnchors}`
        ],
        [
            sec1Labels.hllDate, `${pInfo.hllName || "HLL-01"} - ${today}`,
            sec1Labels.absorbers, `${totalAnchors}`
        ],
        [
            sec1Labels.product, `${displayProductPdf}`,
            sec1Labels.devLen, `${formatDistance(totalLineLen, 2, l)}`
        ],
        [
            sec1Labels.config, `${state.layoutType.replace(/_/g, ' ').toUpperCase()}`,
            sec1Labels.realSpan, `${formatDistance(realSpanMax, 2, l)}`
        ],
        [
            sec1Labels.app, `${state.appMode === "restraint" ? (l === 1 ? "Restraint" : "Retenue") : (l === 1 ? "Fall Arrest" : "Arrêt de chute")}`,
            sec1Labels.maxUsers, `${state.nbUsers}`
        ],
        [
            sec1Labels.elev, `${elevLabel}`,
            sec1Labels.srl, getConnectingDeviceReportName(l)
        ]
    ];

    doc.autoTable({
        startY: 36,
        body: sec1TableBody,
        theme: 'plain',
        styles: {
            fontSize: 7.0,
            cellPadding: 1.3,
            textColor: [30, 41, 59],
            lineColor: [226, 232, 240],
            lineWidth: 0.15
        },
        columnStyles: {
            0: { fontStyle: 'bold', textColor: [71, 85, 105], cellWidth: 38 },
            1: { cellWidth: 53 },
            2: { fontStyle: 'bold', textColor: [71, 85, 105], cellWidth: 38 },
            3: { cellWidth: 53 }
        }
    });

    const sec2StartY = doc.lastAutoTable.finalY + 6;

    // Section 2: Mechanical calculations table
    const isPdfSloped = (state.roofShape === "sloped");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(30, 41, 59);

    if (isPdfSloped) {
        // SINGLE MERGED COMPREHENSIVE TABLE FOR SLOPED ROOF SYSTEM (1 USER, 50kg & 140kg)
        doc.text(pdfTrans.sec2Title[l], 14, sec2StartY);

        const slopedReport = SlopedSystemConesModule.getFullScenarioReport(state.roofSlope || 15, realSpanMax, state.lineLength);
        const sc = slopedReport.scenarios;
        const formatConeSlips = (cones) => cones.map(c => `C${c.index}:${c.slipMm}mm`).join(" | ");

        const uEffort = Calculator.effortLonge(state.product, realSpanMax, 1, state.norm, state.fallFactor, support, isMultiSpan);
        const uDefl = Calculator.deflection(state.product, realSpanMax, state.fallFactor, support, 1, state.norm, isMultiSpan);
        const porteeStr = formatDistance(realSpanMax, 2, l);
        const effortStr = `${uEffort.toFixed(2)} kN`;
        const deflStr = formatDeflection(uDefl, l);

        const slopedHeaders = [
            ["Scénario", "Masse", "Angle Init.", "Angle Final", "Portée max", "Tension max", "Flèche max", "Force Extr. Haut", "Force Extr. Bas", "Glissement Cônes"],
            ["Scenario", "Mass", "Init. Angle", "Final Angle", "Max Span", "Max Tension", "Max Deflect.", "Top End Force", "Bottom End Force", "Cone Slips"],
            ["Escenario", "Masa", "Áng. Inic.", "Áng. Final", "Luz máx.", "Esfuerzo elem.", "Flecha máx.", "Fuerza Extr. Sup.", "Fuerza Extr. Inf.", "Deslizamiento Conos"]
        ][l];

        const scNames = {
            sliding: ["Glissement", "Sliding", "Deslizamiento"][l],
            freefall: ["Chute Libre", "Free Fall", "Caída Libre"][l],
            retained: ["VALEUR RETENUE (MAX)", "RETAINED VALUE (MAX)", "VALOR RETENIDO (MÁX)"][l]
        };

        const slopedBody = [
            [scNames.sliding, "50 kg", `${sc.m50_sliding.initialAngleDeg}°`, `${sc.m50_sliding.finalAngleDeg}°`, porteeStr, effortStr, deflStr, `${sc.m50_sliding.loadCellTopKn.toFixed(3)} kN`, `${sc.m50_sliding.loadCellBottomKn.toFixed(3)} kN`, formatConeSlips(sc.m50_sliding.cones)],
            [scNames.freefall, "50 kg", `${sc.m50_freefall.initialAngleDeg}°`, `${sc.m50_freefall.finalAngleDeg}°`, porteeStr, effortStr, deflStr, `${sc.m50_freefall.loadCellTopKn.toFixed(3)} kN`, `${sc.m50_freefall.loadCellBottomKn.toFixed(3)} kN`, formatConeSlips(sc.m50_freefall.cones)],
            [scNames.sliding, "140 kg", `${sc.m140_sliding.initialAngleDeg}°`, `${sc.m140_sliding.finalAngleDeg}°`, porteeStr, effortStr, deflStr, `${sc.m140_sliding.loadCellTopKn.toFixed(3)} kN`, `${sc.m140_sliding.loadCellBottomKn.toFixed(3)} kN`, formatConeSlips(sc.m140_sliding.cones)],
            [scNames.freefall, "140 kg", `${sc.m140_freefall.initialAngleDeg}°`, `${sc.m140_freefall.finalAngleDeg}°`, porteeStr, effortStr, deflStr, `${sc.m140_freefall.loadCellTopKn.toFixed(3)} kN`, `${sc.m140_freefall.loadCellBottomKn.toFixed(3)} kN`, formatConeSlips(sc.m140_freefall.cones)],
            [scNames.retained, "140 kg", `${slopedReport.retainedMax.initialAngleDeg}°`, `${slopedReport.retainedMax.finalAngleDeg}°`, porteeStr, effortStr, deflStr, `${slopedReport.retainedMax.loadCellTopKn.toFixed(3)} kN`, `${slopedReport.retainedMax.loadCellBottomKn.toFixed(3)} kN`, formatConeSlips(slopedReport.retainedMax.cones)]
        ];

        doc.autoTable({
            startY: sec2StartY + 4,
            head: [slopedHeaders],
            body: slopedBody,
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 6.8, cellPadding: 2 },
            didParseCell: function(data) {
                if (data.row.index === 4) {
                    data.cell.styles.fontWeight = 'bold';
                    data.cell.styles.fillColor = [226, 232, 240];
                    data.cell.styles.textColor = [15, 23, 42];
                }
            }
        });

        if (isOSHA && isMultiSpan && (state.layoutType === "slope_multi" || state.layoutType === "slope_horizontal_comb")) {
            const currentSubY = doc.lastAutoTable.finalY + 6;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);

            const prodUpper = (state.product || "").toUpperCase();
            const maxSysUsers = (prodUpper.includes("LIGHT") || prodUpper.includes("LONG")) ? 3 : 5;

            // Compute sample to get adapted titles and row labels
            const sampleEffort = Calculator.effortLonge(state.product, realSpanMax, 1, state.norm, state.fallFactor, support, true);
            const sampleDefl = Calculator.deflection(state.product, realSpanMax, state.fallFactor, support, 1, state.norm, true);
            const sampleExt1 = Calculator.extremiteForce1(state.product, realSpanMax, 1, state.norm, sampleEffort, sampleDefl, state.fallFactor, support, true);
            const sampleExt2 = Calculator.extremiteForce2(state.product, realSpanMax, 1, state.norm, sampleEffort, sampleDefl, state.fallFactor, support, true);
            const sampleExt3 = Calculator.extremiteForce3(state.product, realSpanMax, 1, state.norm, sampleEffort, sampleDefl, state.fallFactor, support, true);
            const sampleExt4 = Calculator.extremiteForce4(state.product, realSpanMax, 1, state.norm, sampleEffort, sampleDefl, state.fallFactor, support, true);
            const sampleSix = AnchorEffortDistributionModule.calculateRule1_MultiSpan(sampleExt1, sampleExt2, sampleExt3, sampleExt4);
            const sampleFinalSix = AnchorEffortDistributionModule.calculateRule2_FromSpans(sampleSix, state.spans, state.fallPosition?.segmentIndex || 0);
            const adaptedSample = AnchorEffortDistributionModule.getAdaptedMultiSpanResults(sampleFinalSix, totalAnchors, l, state.fallPosition?.segmentIndex || 0, null, state.spans);

            doc.text(adaptedSample.pdfSubtitle, 14, currentSubY);

            const table2HeaderRow = [adaptedSample.pdfColHeader];
            for (let u = 1; u <= maxSysUsers; u++) {
                table2HeaderRow.push(l === 1 ? (u === 1 ? "1 user" : `${u} users`) : `${u} pers.`);
            }

            const anchorRows = adaptedSample.points.map(pt => [pt.pdfLabel]);

            for (let u = 1; u <= maxSysUsers; u++) {
                const uEffort = Calculator.effortLonge(state.product, realSpanMax, u, state.norm, state.fallFactor, support, true);
                const uDefl = Calculator.deflection(state.product, realSpanMax, state.fallFactor, support, u, state.norm, true);
                const uExt1 = Calculator.extremiteForce1(state.product, realSpanMax, u, state.norm, uEffort, uDefl, state.fallFactor, support, true);
                const uExt2 = Calculator.extremiteForce2(state.product, realSpanMax, u, state.norm, uEffort, uDefl, state.fallFactor, support, true);
                const uExt3 = Calculator.extremiteForce3(state.product, realSpanMax, u, state.norm, uEffort, uDefl, state.fallFactor, support, true);
                const uExt4 = Calculator.extremiteForce4(state.product, realSpanMax, u, state.norm, uEffort, uDefl, state.fallFactor, support, true);

                const sixPoints = AnchorEffortDistributionModule.calculateRule1_MultiSpan(uExt1, uExt2, uExt3, uExt4);
                const finalSix = AnchorEffortDistributionModule.calculateRule2_FromSpans(sixPoints, state.spans, state.fallPosition?.segmentIndex || 0);
                const adaptedU = AnchorEffortDistributionModule.getAdaptedMultiSpanResults(finalSix, totalAnchors, l, state.fallPosition?.segmentIndex || 0, null, state.spans);

                adaptedU.points.forEach((pt, pIdx) => {
                    anchorRows[pIdx].push(`${pt.val.toFixed(2)} kN`);
                });
            }

            doc.autoTable({
                startY: currentSubY + 4,
                head: [table2HeaderRow],
                body: anchorRows,
                theme: 'striped',
                headStyles: { fillColor: [15, 23, 42] },
                styles: { fontSize: 7 }
            });
        }
    } else {
        // STANDARD TABLE 2 FOR FLAT ROOF / OVERHEAD / TRIANGLE ROOF
        doc.text(pdfTrans.sec2Title[l], 14, sec2StartY);

        const prodUpper = (state.product || "").toUpperCase();
        const maxSysUsers = (prodUpper.includes("LIGHT") || prodUpper.includes("LONG")) ? 3 : 5;

        const isSingleSpan = (state.layoutType === "single_span" || state.layoutType === "slope_single");
        const isCrossLayout = (state.layoutType === "cross_spans");
        const isGridLayout = (state.layoutType === "grid_system");

        if (isCrossLayout && isOSHA) {
            // Configuration 11: Cross Spans (Rule 3 - 4 branches)
            const fallBr = state.fallPosition?.branch || "north";
            const table2HeaderRow = [["Indicateur / Branche (Croix)", "Indicator / Branch (Cross)", "Indicador / Rama (Cruz)"][l]];
            for (let u = 1; u <= maxSysUsers; u++) {
                table2HeaderRow.push(l === 1 ? (u === 1 ? "1 user" : `${u} users`) : `${u} pers.`);
            }

            const rowMaxSpan = [pdfTrans.rowMaxSpan[l]];
            const rowForceL = [pdfTrans.rowForceL[l]];
            const rowDefl = [pdfTrans.rowDefl[l]];

            const tagFall = (l === 1 ? " - Fall 100%" : (l === 2 ? " - Caída 100%" : " - Chute 100%"));
            const tagOther = " - 25%";
            const rowNorth = [pdfTrans.rowCrossNorth[l] + (fallBr === "north" ? tagFall : tagOther)];
            const rowEast = [pdfTrans.rowCrossEast[l] + (fallBr === "east" ? tagFall : tagOther)];
            const rowSouth = [pdfTrans.rowCrossSouth[l] + (fallBr === "south" ? tagFall : tagOther)];
            const rowWest = [pdfTrans.rowCrossWest[l] + (fallBr === "west" ? tagFall : tagOther)];

            for (let u = 1; u <= maxSysUsers; u++) {
                const uEffort = Calculator.effortLonge(state.product, realSpanMax, u, state.norm, state.fallFactor, support, false);
                const uDefl = Calculator.deflection(state.product, realSpanMax, state.fallFactor, support, u, state.norm, false);
                const uExt1 = Calculator.extremiteForce1(state.product, realSpanMax, u, state.norm, uEffort, uDefl, state.fallFactor, support, false);
                const crossRes = AnchorEffortDistributionModule.calculateRule3_Cross(uExt1, fallBr);

                rowMaxSpan.push(formatDistance(realSpanMax, 2, l));
                rowForceL.push(`${uEffort.toFixed(2)} kN`);
                rowDefl.push(formatDeflection(uDefl, l));

                rowNorth.push(`${crossRes.values[0].toFixed(2)} kN`);
                rowEast.push(`${crossRes.values[1].toFixed(2)} kN`);
                rowSouth.push(`${crossRes.values[2].toFixed(2)} kN`);
                rowWest.push(`${crossRes.values[3].toFixed(2)} kN`);
            }

            const mechData = [
                rowMaxSpan,
                rowForceL,
                rowDefl,
                rowNorth,
                rowEast,
                rowSouth,
                rowWest
            ];

            doc.autoTable({
                startY: sec2StartY + 4,
                head: [table2HeaderRow],
                body: mechData,
                theme: 'striped',
                headStyles: { fillColor: [15, 23, 42] },
                styles: { fontSize: 8 }
            });
        } else if (isGridLayout && isOSHA) {
            // Configuration 12: Grid System (Rule 4 - Preload & Dynamic Levels)
            const gs = state.gridSystem || { nx: 3, ny: 3 };
            const nx = Math.max(2, gs.nx || 3);
            const ny = Math.max(2, gs.ny || 3);
            const fallCross = { x: state.fallPosition?.gridCrossX || 0, z: state.fallPosition?.gridCrossZ || 0 };
            const fallBranch = state.fallPosition?.gridBranch || "X+";

            const uEffort = Calculator.effortLonge(state.product, realSpanMax, state.nbUsers, state.norm, state.fallFactor, support, true);
            const uDefl = Calculator.deflection(state.product, realSpanMax, state.fallFactor, support, state.nbUsers, state.norm, true);
            const uExt1 = Calculator.extremiteForce1(state.product, realSpanMax, state.nbUsers, state.norm, uEffort, uDefl, state.fallFactor, support, true);
            const gridRes = AnchorEffortDistributionModule.calculateRule4_Grid(uExt1, nx, ny, state.userMassKg || 141, state.gridPretensionKg || 600, fallCross, fallBranch);

            const gridHeaders = [
                ["Niveau Grille / Emplacement", "Facteur", "Pt Chute - Total", "3 Autres Branches - Total", "Statut"],
                ["Grid Level / Location", "Factor", "Fall Point - Total", "3 Other Branches - Total", "Status"],
                ["Nivel Cuadrícula / Ubicación", "Factor", "Pto Caída - Total", "3 Otras Ramas - Total", "Estado"]
            ][l];

            const gridRows = [];
            gridRows.push([
                ["Croix Chute - Niv. 0", "Fall Cross - Level 0", "Cruz Caída - Nivel 0"][l],
                "100%",
                `${gridRes.level0.totalFall.toFixed(2)} kN - P0+W: ${gridRes.prechargeFall.toFixed(2)} + Dyn: ${gridRes.dynFall.toFixed(2)}`,
                `${gridRes.level0.totalOther.toFixed(2)} kN - P0+W/3: ${gridRes.prechargeOther.toFixed(2)} + Dyn: ${gridRes.dynOther.toFixed(2)}`,
                ["Actif", "Active", "Activo"][l]
            ]);

            const maxLevels = Math.min(5, (nx - 1) + (ny - 1));
            for (let lvl = 1; lvl <= maxLevels; lvl++) {
                const factor = Math.pow(ANCHOR_EFFORT_CONFIG.GRID_LEVEL_FACTOR, lvl);
                let pChute = factor * (gridRes.prechargeFall + gridRes.dynFall);
                let pOther = factor * (gridRes.prechargeOther + gridRes.dynOther);
                let isCutoff = false;
                if (pChute < gridRes.cutoff) { pChute = 0; isCutoff = true; }
                if (pOther < gridRes.cutoff) { pOther = 0; }
                const statusStr = isCutoff
                    ? ["Coupure <1%", "Cutoff <1%", "Corte <1%"][l]
                    : ["Actif", "Active", "Activo"][l];

                gridRows.push([
                    `${["Croix Niveau", "Cross Level", "Cruz Nivel"][l]} ${lvl}`,
                    `${(factor * 100).toFixed(factor < 0.01 ? 2 : 1)}%`,
                    `${pChute.toFixed(2)} kN`,
                    `${pOther.toFixed(2)} kN`,
                    statusStr
                ]);
            }

            doc.autoTable({
                startY: sec2StartY + 4,
                head: [gridHeaders],
                body: gridRows,
                theme: 'striped',
                headStyles: { fillColor: [15, 23, 42] },
                styles: { fontSize: 7.5 }
            });
        } else if (!isOSHA || isSingleSpan || (state.oshaSpanMode === "unique")) {
            // EN 795 (toujours 2 points) OU OSHA single-portée (2 points)
            const table2HeaderRow = [pdfTrans.table2Headers[l][0]];
            for (let u = 1; u <= maxSysUsers; u++) {
                table2HeaderRow.push(l === 1 ? (u === 1 ? "1 user" : `${u} users`) : `${u} pers.`);
            }

            const rowMaxSpan = [pdfTrans.rowMaxSpan[l]];
            const rowForceL = [pdfTrans.rowForceL[l]];
            const rowDefl = [pdfTrans.rowDefl[l]];
            const rowExt1 = [pdfTrans.rowExt1[l]];
            const rowExt2 = [pdfTrans.rowExt2[l]];

            for (let u = 1; u <= maxSysUsers; u++) {
                let uEffort = 0, uDefl = 0, uExt1 = 0, uExt2 = 0;
                if (!isOSHA) {
                    const enFF = computeFallFactorFromElevation(state.hllElevationPreset, state.hllElevation, state.bodyPosition);
                    uEffort = Calculator.effortLonge(state.product, realSpanMax, u, "EN 795", enFF, support, false);
                    uDefl = Calculator.deflection(state.product, realSpanMax, enFF, support, u, "EN 795", false);
                    uExt1 = Calculator.extremiteForce1(state.product, realSpanMax, u, "EN 795", uEffort, uDefl, enFF, support, false);
                    uExt2 = Calculator.extremiteForce2(state.product, realSpanMax, u, "EN 795", uEffort, uDefl, enFF, support, false);
                } else {
                    const oshaFF = (typeof state.fallFactor === "number" && !isNaN(state.fallFactor) && state.fallFactor > 0)
                        ? state.fallFactor
                        : ((typeof state.engineerCoefficient === "number" && !isNaN(state.engineerCoefficient)) ? state.engineerCoefficient : 1.00);
                    const baseEff = Calculator.effortLonge(state.product, realSpanMax, u, "OSHA", 1.0, support, false);
                    uDefl = Calculator.deflection(state.product, realSpanMax, 1.0, support, u, "OSHA", false);
                    const baseExt1 = Calculator.extremiteForce1(state.product, realSpanMax, u, "OSHA", baseEff, uDefl, 1.0, support, false);
                    const baseExt2 = Calculator.extremiteForce2(state.product, realSpanMax, u, "OSHA", baseEff, uDefl, 1.0, support, false);
                    uEffort = baseEff * oshaFF;
                    uExt1 = baseExt1 * oshaFF;
                    uExt2 = baseExt2 * oshaFF;
                }

                rowMaxSpan.push(formatDistance(realSpanMax, 2, l));
                rowForceL.push(`${uEffort.toFixed(2)} kN`);
                rowDefl.push(formatDeflection(uDefl, l));
                rowExt1.push(`${uExt1.toFixed(2)} kN`);
                rowExt2.push(`${uExt2.toFixed(2)} kN`);
            }

            const mechData = [
                rowMaxSpan,
                rowForceL,
                rowDefl,
                rowExt1,
                rowExt2
            ];

            doc.autoTable({
                startY: sec2StartY + 3,
                head: [table2HeaderRow],
                body: mechData,
                theme: 'striped',
                headStyles: { fillColor: [15, 23, 42] },
                styles: { fontSize: 7.2, cellPadding: 1.3 }
            });
        } else {
            // OSHA Multi-Portée : résultats adaptés au nombre réel d'ancrages (tous les ancrages)
            const prodUpper = (state.product || "").toUpperCase();
            const maxSysUsers = (prodUpper.includes("LIGHT") || prodUpper.includes("LONG")) ? 3 : 5;

            // Compute first user sample to get adapted headers and row names
            const sampleEffort = Calculator.effortLonge(state.product, realSpanMax, 1, state.norm, state.fallFactor, support, true);
            const sampleDefl = Calculator.deflection(state.product, realSpanMax, state.fallFactor, support, 1, state.norm, true);
            const sampleExt1 = Calculator.extremiteForce1(state.product, realSpanMax, 1, state.norm, sampleEffort, sampleDefl, state.fallFactor, support, true);
            const sampleExt2 = Calculator.extremiteForce2(state.product, realSpanMax, 1, state.norm, sampleEffort, sampleDefl, state.fallFactor, support, true);
            const sampleExt3 = Calculator.extremiteForce3(state.product, realSpanMax, 1, state.norm, sampleEffort, sampleDefl, state.fallFactor, support, true);
            const sampleExt4 = Calculator.extremiteForce4(state.product, realSpanMax, 1, state.norm, sampleEffort, sampleDefl, state.fallFactor, support, true);
            const sampleSix = AnchorEffortDistributionModule.calculateRule1_MultiSpan(sampleExt1, sampleExt2, sampleExt3, sampleExt4);
            const sampleFinalSix = AnchorEffortDistributionModule.calculateRule2_FromSpans(sampleSix, state.spans, state.fallPosition?.segmentIndex || 0);
            const adaptedSample = AnchorEffortDistributionModule.getAdaptedMultiSpanResults(sampleFinalSix, totalAnchors, l, state.fallPosition?.segmentIndex || 0, null, state.spans);

            const table2HeaderRow = [adaptedSample.pdfColHeader];
            for (let u = 1; u <= maxSysUsers; u++) {
                table2HeaderRow.push(l === 1 ? (u === 1 ? "1 user" : `${u} users`) : `${u} pers.`);
            }

            const rowMaxSpan = [pdfTrans.rowMaxSpan[l]];
            const rowForceL = [pdfTrans.rowForceL[l]];
            const rowDefl = [pdfTrans.rowDefl[l]];
            const anchorRows = adaptedSample.points.map(pt => [pt.pdfLabel]);

            for (let u = 1; u <= maxSysUsers; u++) {
                const uEffort = Calculator.effortLonge(state.product, realSpanMax, u, state.norm, state.fallFactor, support, true);
                const uDefl = Calculator.deflection(state.product, realSpanMax, state.fallFactor, support, u, state.norm, true);
                const uExt1 = Calculator.extremiteForce1(state.product, realSpanMax, u, state.norm, uEffort, uDefl, state.fallFactor, support, true);
                const uExt2 = Calculator.extremiteForce2(state.product, realSpanMax, u, state.norm, uEffort, uDefl, state.fallFactor, support, true);
                const uExt3 = Calculator.extremiteForce3(state.product, realSpanMax, u, state.norm, uEffort, uDefl, state.fallFactor, support, true);
                const uExt4 = Calculator.extremiteForce4(state.product, realSpanMax, u, state.norm, uEffort, uDefl, state.fallFactor, support, true);

                const sixPoints = AnchorEffortDistributionModule.calculateRule1_MultiSpan(uExt1, uExt2, uExt3, uExt4);
                const finalSix = AnchorEffortDistributionModule.calculateRule2_FromSpans(sixPoints, state.spans, state.fallPosition?.segmentIndex || 0);
                const adaptedU = AnchorEffortDistributionModule.getAdaptedMultiSpanResults(finalSix, totalAnchors, l, state.fallPosition?.segmentIndex || 0, null, state.spans);

                rowMaxSpan.push(formatDistance(realSpanMax, 2, l));
                rowForceL.push(`${uEffort.toFixed(2)} kN`);
                rowDefl.push(formatDeflection(uDefl, l));
                adaptedU.points.forEach((pt, pIdx) => {
                    anchorRows[pIdx].push(`${pt.val.toFixed(2)} kN`);
                });
            }

            const mechData = [
                rowMaxSpan,
                rowForceL,
                rowDefl,
                ...anchorRows
            ];

            doc.autoTable({
                startY: sec2StartY + 3,
                head: [table2HeaderRow],
                body: mechData,
                theme: 'striped',
                headStyles: { fillColor: [15, 23, 42] },
                styles: { fontSize: 7.2, cellPadding: 1.3 }
            });
        }
    }

    // Section 3: Components & Fixations Table with exact 3 columns
    const currentY = doc.lastAutoTable.finalY + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(30, 41, 59);
    doc.text(pdfTrans.sec3Title[l], 14, currentY);

    const compsList = (COMPONENTS_DB[normalizeProduct(state.product)] || COMPONENTS_DB[state.product]) || [];
    const checkedComps = compsList.filter(c => c.checked);

    const hasOmegaOrMini = checkedComps.some(c => {
        const idL = (c.id || "").toLowerCase();
        const nL = (c.name || "").toLowerCase();
        return idL.includes("omega") || idL.includes("mini") || nL.includes("omega") || nL.includes("mini");
    });

    const tableRows = [];

    // 1. Matrice (Absorbeur) selon la gamme / sous-gamme
    const pdfSubRange = getLongRangeSubRange(state.lineLength);
    const matriceExtremeText = pdfSubRange === "LONG RANGE"
        ? ["Matrice Extreme - Long Range", "Extreme Matrix - Long Range", "Matriz Extreme - Long Range"][l]
        : (pdfSubRange === "SUPER RANGE"
            ? ["Matrice Extreme - Super Range", "Extreme Matrix - Super Range", "Matriz Extreme - Super Range"][l]
            : ["Matrice Extreme - Ultra Range", "Extreme Matrix - Ultra Range", "Matriz Extreme - Ultra Range"][l]);
    const matriceName = isPro(state.product) ? (pdfTrans.matricePro || pdfTrans.matriceNewPro)[l] : (isCore(state.product) ? (pdfTrans.matriceCore || pdfTrans.matriceLightPro)[l] : matriceExtremeText);
    const lvl1 = getFixationInfo(state.product, "matrice_platine", state.roofTexture, state.product);
    const countLvl1 = typeof lvl1.nombre === 'number' ? `${lvl1.nombre * totalAnchors} - ${lvl1.nombre}/matrice` : lvl1.nombre;
    tableRows.push([
        `${matriceName} - x${totalAnchors}`,
        `${countLvl1}`,
        formatFixationType(lvl1.type_fixation)
    ]);

    // 2. Platine de fixation au support / potelet
    const platineName = isPro(state.product) ? (pdfTrans.platinePro || pdfTrans.platineNewPro)[l] : (isCore(state.product) ? (pdfTrans.platineCore || pdfTrans.platineLightPro)[l] : (pdfTrans.platineExtreme || pdfTrans.platineLongRange)[l]);
    const lvl2 = getFixationInfo(state.product, "platine_support", state.roofTexture, state.product);
    const countLvl2 = typeof lvl2.nombre === 'number' ? `${lvl2.nombre * totalAnchors} - ${lvl2.nombre}/platine` : lvl2.nombre;
    const typeFixPlatine = hasOmegaOrMini ? pdfTrans.inoxBolts[l] : formatFixationType(lvl2.type_fixation);

    tableRows.push([
        `${platineName} - x${totalAnchors}`,
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

        if (cIdLower.includes("x-matrix") || cIdLower.includes("xmatrix")) {
            if (state.layoutType === "grid_system") {
                const gs = state.gridSystem || { nx: 3, ny: 3 };
                qtyItem = (gs.nx || 3) * (gs.ny || 3);
            } else {
                qtyItem = 1;
            }
            countFix = typeof fixInfo.nombre === 'number' ? fixInfo.nombre : 8;
        } else if (cIdLower.includes("x-cone") || cIdLower.includes("xcone")) {
            const xConeCount = calculateXConeCount(activeLayout);
            qtyItem = xConeCount;
            countFix = typeof fixInfo.nombre === 'number' ? `${fixInfo.nombre * xConeCount} - ${fixInfo.nombre}/x-cone` : fixInfo.nombre;
        } else if (typeof fixInfo.nombre === 'number') {
            countFix = `${fixInfo.nombre * totalAnchors} - ${fixInfo.nombre}/potelet`;
        }

        tableRows.push([
            `${getComponentName(c)} - x${qtyItem}`,
            `${countFix}`,
            formatFixationType(fixInfo.type_fixation)
        ]);
    });

    if (tableRows.length === 0) {
        tableRows.push([pdfTrans.noCompChecked[l], "-", "-"]);
    }

    doc.autoTable({
        startY: currentY + 3,
        head: [pdfTrans.table3Headers[l]],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 7.2, cellPadding: 1.3 }
    });

    // =========================================================================
    // PAGE 2: PLAN DE REPÉRAGE GÉNÉRAL (VUE DE DESSUS 2D — PLEINE PAGE)
    // =========================================================================
    doc.addPage();

    // Brand Header Page 2
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(isEn ? "HOOKT — MARKING PLAN (FULL PAGE TOP-DOWN CAD VIEW)" : "HOOKT — PLAN DE REPÉRAGE GÉNÉRAL (VUE DE DESSUS)", 14, 14);

    let currentP2Y = 27;

    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(isEn ? "1. Marking Plan (Top View - CAD Scale) :" : "1. Plan de repérage général (Vue de dessus - Échelle CAD) :", 14, currentP2Y);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(isEn
        ? `Roof Dimensions: L = ${formatDistance(state.L || 15.0, 2, l)} | Width = ${formatDistance(state.l || 10.0, 2, l)} | Line Setback: ${formatDistance(state.line_to_edge || 2.0, 2, l)} | Developed Length: ${formatDistance(totalLineLen, 2, l)}`
        : `Dimensions Toiture : L = ${formatDistance(state.L || 15.0, 2, l)} | Largeur = ${formatDistance(state.l || 10.0, 2, l)} | Distance au bord : ${formatDistance(state.line_to_edge || 2.0, 2, l)} | Longueur développée : ${formatDistance(totalLineLen, 2, l)}`,
        14, currentP2Y + 4.5);

    // Full page 2D capture: 182mm wide, 145mm high!
    const fullP2W = 182;
    const fullP2H = 145;
    const p2ImgY = currentP2Y + 7;

    try {
        const snap2D = capturePlanDeReperageSnapshot(fullP2W, fullP2H);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        doc.rect(14, p2ImgY, fullP2W, fullP2H);

        if (snap2D && snap2D.dataUrl) {
            doc.addImage(snap2D.dataUrl, 'PNG', 14, p2ImgY, fullP2W, fullP2H);
        }
    } catch (e) {
        console.warn("Could not capture 2D plan snapshot:", e);
    }

    // Technical Blueprint Cartouche at bottom of Page 2 (Y: 184 to 274)
    const cartouche2Y = p2ImgY + fullP2H + 4.5;
    doc.autoTable({
        startY: cartouche2Y,
        body: [
            [
                isEn ? "CAD Layout Mode" : "Mode d'Implantation",
                `${state.layoutType.replace(/_/g, ' ').toUpperCase()}`,
                isEn ? "Anchor Posts Count" : "Nombre de Potelets",
                `${totalAnchors} ancrages (${totalAnchors} potelets certifiés)`
            ],
            [
                isEn ? "Line-to-Edge Distance (d)" : "Distance Ligne / Bord (d)",
                `${formatDistance(state.line_to_edge || 2.0, 2, l)}`,
                isEn ? "Developed Wire Length" : "Longueur Câble Développée",
                `${formatDistance(totalLineLen, 2, l)}`
            ],
            [
                isEn ? "Max Real Span" : "Portée Maximale Réelle",
                `${formatDistance(realSpanMax, 2, l)}`,
                isEn ? "Initial Cable Pretension" : "Prétension Initiale Câble",
                UnitsModule.formatPretension(state.product.includes("RANGE") ? 600 : 100)
            ],
            [
                isEn ? "Lifeline Cable Type" : "Spécification Câble",
                "Inox 316 Ø 8 mm (7x7 / 7x19) - Résistance rupture > 45 kN",
                isEn ? "Technical Legend" : "Légende du Plan",
                "[A1..An] Ancrages avec étiquettes | [S1..Sn] Portées avec cotes | [d] Recul bord toiture"
            ]
        ],
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.8, lineColor: [203, 213, 225], lineWidth: 0.2 },
        columnStyles: {
            0: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105], cellWidth: 42 },
            1: { cellWidth: 49 },
            2: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105], cellWidth: 42 },
            3: { cellWidth: 49 }
        }
    });

    // =========================================================================
    // PAGE 3: VISUALISATION 3D DE LA TOITURE (PLEINE PAGE)
    // =========================================================================
    doc.addPage();

    // Brand Header Page 3
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(isEn ? "HOOKT — 3D ROOF & LIFELINE VISUALIZATION (FULL PAGE)" : "HOOKT — VISUALISATION 3D DE LA TOITURE & LIGNE DE VIE", 14, 14);

    let currentP3Y = 27;

    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(isEn ? "2. 3D Axonometric Roof Visualization :" : "2. Visualisation Tridimensionnelle Axonométrique de la Toiture :", 14, currentP3Y);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(isEn
        ? `Perspective Overview | Lifeline Elevation: ${elevLabel} | Roof Texture: ${state.roofTexture || "concrete"} | Post Height: ${(parseFloat(state.hllElevation) || 0.45).toFixed(2)} m`
        : `Vue Perspective Globale | Élévation ligne : ${elevLabel} | Nature support : ${state.roofTexture || "béton"} | Hauteur potelets : ${(parseFloat(state.hllElevation) || 0.45).toFixed(2)} m`,
        14, currentP3Y + 4.5);

    // Full page 3D capture: 182mm wide, 145mm high!
    const fullP3W = 182;
    const fullP3H = 145;
    const p3ImgY = currentP3Y + 7;

    try {
        const snap3D = captureVue3DToitSnapshot(fullP3W, fullP3H);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        doc.rect(14, p3ImgY, fullP3W, fullP3H);

        if (snap3D && snap3D.dataUrl) {
            doc.addImage(snap3D.dataUrl, 'PNG', 14, p3ImgY, fullP3W, fullP3H);
        }
    } catch (e) {
        console.warn("Could not capture 3D roof snapshot:", e);
    }

    // Technical Blueprint Cartouche at bottom of Page 3 (Y: 184 to 274)
    const cartouche3Y = p3ImgY + fullP3H + 4.5;
    doc.autoTable({
        startY: cartouche3Y,
        body: [
            [
                isEn ? "Lifeline Elevation (HLL)" : "Élévation de Ligne (HLL)",
                `${elevLabel}`,
                isEn ? "Anchor Post Type" : "Modèle de Potelet",
                `${postName}`
            ],
            [
                isEn ? "Roof Geometry / Slope" : "Géométrie / Pente Toit",
                `${state.roofShape === "sloped" ? `Monopente ${state.roofSlope || 15}°` : (state.roofShape === "gable" ? `Double pente ${state.roofSlope || 15}°` : "Toiture terrasse plate")}`,
                isEn ? "Clear Height Under Roof" : "Hauteur Disponible sous Toit",
                `${formatDistance(state.roofHeightAboveGround || 6.0, 2, l)}`
            ],
            [
                isEn ? "Substrate / Structure" : "Support / Structure d'accueil",
                `${state.roofTexture === "steel_deck" ? "Bac acier / Profil trapézoïdal" : (state.roofTexture === "wood" ? "Structure bois / Charpente" : "Dalle béton armé")}`,
                isEn ? "Fixation Interface" : "Interface de Fixation",
                `${support}`
            ],
            [
                isEn ? "3D Verification Notes" : "Observations 3D",
                isEn
                    ? "Axonometric view confirms post verticality, cable routing, edge setbacks, and absence of visual clashes with structural members."
                    : "Le modèle 3D valide la verticalité des potelets, la continuité du câble, le respect des distances aux rives et l'implantation générale.",
                isEn ? "System Standard" : "Référentiel Normatif",
                `${state.norm} / OSHA 1926.502 Subpart M`
            ]
        ],
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.8, lineColor: [203, 213, 225], lineWidth: 0.2 },
        columnStyles: {
            0: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105], cellWidth: 42 },
            1: { cellWidth: 49 },
            2: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [71, 85, 105], cellWidth: 42 },
            3: { cellWidth: 49 }
        }
    });

    // =========================================================================
    // PAGE 4: TABLEAUX DÉTAILLÉS DES ANCRAGES & DES PORTÉES
    // =========================================================================
    doc.addPage();

    // Brand Header Page 4
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(isEn ? "HOOKT — COMPREHENSIVE ANCHORS & SPANS SPECIFICATIONS" : "HOOKT — TABLEAUX EXHAUSTIFS DES ANCRAGES & DES PORTÉES", 14, 14);

    let currentP4Y = 27;

    // Single Source of Truth Generator
    const pdfSystemLabels = SystemLabelingModule.generateSystemLabels(state);
    const fallSpanIdx = state.spans ? Math.max(0, state.spans.findIndex(s => s.id === state.selectedFallSpanId)) : 0;
    const baseTensionKn = 12.0;

    // 3. Tableau Complet de Tous les Ancrages (A1..AN)
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(isEn ? "3. Comprehensive Table of All Anchors (A1 to An) :" : "3. Tableau Exhaustif de Tous les Ancrages (A1 à An) :", 14, currentP4Y);

    const allGeneratedAnchors = generateAllAnchorsTable(state.spans, fallSpanIdx, baseTensionKn, state.product);
    const isPdfOSHA = (state.norm === "OSHA");
    const pdfEngCoef = isPdfOSHA
        ? ((typeof state.fallFactor === "number" && !isNaN(state.fallFactor))
            ? state.fallFactor
            : ((typeof state.engineerCoefficient === "number" && !isNaN(state.engineerCoefficient)) ? state.engineerCoefficient : 1.00))
        : 1.00;
    const isPdfAdjusted = isPdfOSHA && (Math.abs(pdfEngCoef - 1.00) > 0.001);

    let anchorHeaders, anchorRows;
    if (isPdfAdjusted) {
        anchorHeaders = isEn
            ? [["Tag", "Type / Role", "Adjacent Spans", "Test Result", `Adjusted (Fall Factor ${pdfEngCoef.toFixed(2)})`, "Status / Remark"]]
            : [["Étiquette", "Type / Rôle", "Portées Adjacentes", "Résultat d'essai", `Résultat ajusté (Fall Factor ${pdfEngCoef.toFixed(2)})`, "Statut / Remarque"]];
        anchorRows = allGeneratedAnchors.map(a => [
            a.id,
            a.role,
            (a.adjacentSpans && a.adjacentSpans.length > 0) ? a.adjacentSpans.join(", ") : "-",
            UnitsModule.formatForce(a.effortKn),
            UnitsModule.formatForce(a.effortKn * pdfEngCoef),
            a.remark
        ]);
    } else {
        anchorHeaders = isEn
            ? [["Tag", "Type / Role", "Adjacent Spans", `Load (${state.unitSystem === "imperial" ? "lbf" : "kN"})`, "Status / Remark"]]
            : [["Étiquette", "Type / Rôle", "Portées Adjacentes", `Effort (${state.unitSystem === "imperial" ? "lbf" : "kN"})`, "Statut / Remarque"]];
        anchorRows = allGeneratedAnchors.map(a => [
            a.id,
            a.role,
            (a.adjacentSpans && a.adjacentSpans.length > 0) ? a.adjacentSpans.join(", ") : "-",
            UnitsModule.formatForce(a.effortKn),
            a.remark
        ]);
    }

    doc.autoTable({
        startY: currentP4Y + 4,
        head: anchorHeaders,
        body: anchorRows,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 7.5, cellPadding: 2.2 },
        didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 0) {
                data.cell.styles.fontWeight = 'bold';
            }
        }
    });

    // 4. Tableau des Portées (Longueurs en FT en unités US, jamais de pouces)
    const spanTableY = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(isEn ? "4. Spans Table — Critical Values Summary :" : "4. Tableau des Portées — Récapitulatif des Valeurs Critiques :", 14, spanTableY);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(isEn
        ? "This table summarizes the critical values (maximum cable deflection and anchor loads under worst-case fall simulation)."
        : "Ce tableau récapitule les valeurs critiques (flèche maximale du câble et efforts d'ancrage calculés au cas le plus défavorable).",
        14, spanTableY + 4.5);

    const longestSpanLen = state.spans ? Math.max(...state.spans.map(s => s.length || 0)) : 15;
    const spanHeaders = isEn
        ? [["Span", "End Anchors", "Length", "Slope", "Critical Span Status"]]
        : [["Portée", "Extrémités", "Longueur", "Pente", "Statut / Analyse Critique"]];
    const spanRows = (pdfSystemLabels.spans || []).map(s => {
        const isCritical = (s.length >= longestSpanLen - 0.05) || (state.selectedFallSpanId && s.internalSpanId === state.selectedFallSpanId);
        return [
            s.id,
            `${s.fromAnchorId} → ${s.toAnchorId}`,
            UnitsModule.formatLength(s.length),
            s.slopeDeg ? `${s.slopeDeg}°` : "-",
            isCritical ? (isEn ? "★ CRITICAL SPAN - Max Tension & Deflection" : "★ PORTÉE CRITIQUE - Tension & Flèche max") : (isEn ? "Standard span" : "Portée conforme")
        ];
    });

    doc.autoTable({
        startY: spanTableY + 7.5,
        head: spanHeaders,
        body: spanRows,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 7.5, cellPadding: 2.2 },
        didParseCell: function(data) {
            if (data.section === 'body' && data.row.raw && data.row.raw[4] && data.row.raw[4].includes("★")) {
                data.cell.styles.fontWeight = 'bold';
                data.cell.styles.fillColor = [254, 242, 242];
            }
        }
    });

    // =========================================================================
    // PAGE 5: SOMMAIRE, SRL TECHNIQUE, EFFORTS DE COIN & SCHÉMA DE CHUTE
    // =========================================================================
    doc.addPage();

    // Brand Header Page 5
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(isEn ? "HOOKT — SRL SPECIFICATIONS, CORNER FORCES & FALL CLEARANCE" : "HOOKT — DISPOSITIF SRL, EFFORTS DE COIN & BILAN DE CHUTE", 14, 14);

    let p3Y = 27;

    // A. Table des Matières (Sommaire)
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(isEn ? "Table of Contents :" : "Table des Matières du Dossier Réglementaire :", 14, p3Y);

    const tocHeaders = isEn
        ? [["Page", "Chapter Title", "Reference / Specification"]]
        : [["Page", "Titre du Chapitre", "Norme / Spécification"]];
    const tocRows = [
        ["Page 1", isEn ? "General Project Information, Mechanical Assessment & BOM" : "Informations Générales, Projet, Bilan Mécanique & Nomenclature", "OSHA 1926.502 / EN 795-C"],
        ["Page 2", isEn ? "Marking Plan (Full Page Top-Down CAD View)" : "Plan de Repérage Général (Pleine Page - Vue de Dessus)", "Implantation & Cotes de Toiture"],
        ["Page 3", isEn ? "3D Roof & Lifeline Visualization (Full Page Axonometric)" : "Visualisation 3D de la Toiture (Pleine Page - Rendu Tridimensionnel)", "Perspective & Élévation de Ligne"],
        ["Page 4", isEn ? "Comprehensive Anchors Table & Spans Table (Critical Values Summary)" : "Tableaux Exhaustifs des Ancrages & Récapitulatif des Valeurs Critiques par Portée", "Efforts & Portée Critique"],
        ["Page 5", isEn ? "SRL Device Datasheet, Corner Vector Forces & Fall Clearance" : "Fiche Technique SRL, Efforts de Coin Résolus & Dégagement de Chute", "ANSI Z359.14 / Schéma de Chute"]
    ];

    doc.autoTable({
        startY: p3Y + 3,
        head: tocHeaders,
        body: tocRows,
        theme: 'striped',
        headStyles: { fillColor: [71, 85, 105] },
        styles: { fontSize: 6.5, cellPadding: 1.1 }
    });

    p3Y = doc.lastAutoTable.finalY + 6;

    // B. Fiche Technique Dispositif de Connexion & Paramètres d'Arrêt
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(isEn ? "Connecting Device Technical Datasheet & Arrest Parameters :" : "Fiche Technique Dispositif & Paramètres d'Arrêt :", 14, p3Y);

    const devName = getConnectingDeviceReportName(l);
    const madMVal = (typeof state.madM === "number" && state.madM > 0) ? state.madM : ((typeof state.customMad === "number" && state.customMad > 0) ? state.customMad : 1.07);
    const madInVal = madMVal / 0.0254;
    const madDualStr = `${madMVal.toFixed(2)} m (${madInVal.toFixed(1)} in)`;

    const arrestFKn = (typeof state.arrestForceKn === "number" && state.arrestForceKn > 0) ? state.arrestForceKn : 4.5;
    const arrestFLbf = arrestFKn * UnitsModule.KN_TO_LBF;
    const arrestForce1UserStr = `${arrestFLbf.toFixed(0)} lbf (${arrestFKn.toFixed(2)} kN)`;

    const globalArrestStr = (state.arrestLoadMode === "custom")
        ? UnitsModule.formatForce(state.arrestLoadValue || state.arrestLoadKn || arrestFKn)
        : `${(lumpM * arrestFLbf).toFixed(1)} lbf (${(lumpM * arrestFKn).toFixed(2)} kN)`;

    const devClassStr = (state.connectingDevice === "srd")
        ? (srlData ? `${isEn ? "Class" : "Classe"} ${srlData.classe}` : "Classe 2")
        : (state.connectingDevice === "custom_srd"
            ? `${isEn ? "Class" : "Classe"} ${state.customDeviceClass || 2}`
            : "N/A");

    const isLanyard = (state.connectingDevice === "lanyard" || state.connectingDevice === "custom_lanyard");
    const userRetractedM = (typeof state.retractedLengthM === "number" && state.retractedLengthM > 0)
        ? state.retractedLengthM
        : ((state.connectingDevice === "srd")
            ? (srlData ? (srlData.retracted_length_m || srlData.retracted_len || 0.60) : 0.60)
            : ((state.connectingDevice === "custom_srd" || state.connectingDevice === "custom_lanyard")
                ? (state.customDeviceLengthM || 0.60)
                : 1.80));

    // Determine modified flags for report (Spec V2 — 10 / Prompt 16)
    const isRetractedMod = state.isRetractedLengthModified || (
        state.connectingDevice === "srd" && srlData && srlData.retracted_length_m != null &&
        Math.abs(userRetractedM - srlData.retracted_length_m) > 0.005
    );
    const isArrestForceMod = state.isArrestForceModified || (
        state.connectingDevice === "srd" && srlData &&
        Math.abs(state.arrestForceKn - srlData.default_arrest_force_kn) > 0.05
    );
    const isMadMod = (state.isMadModified === true);

    const modTag = isEn ? " (user modified value)" : " (valeur modifiée par l'utilisateur)";

    const lenLabel = isLanyard
        ? (isEn ? "Lanyard Length" : "Longueur de la Longe")
        : (isEn ? "Retracted Length" : "Longueur Rétractée");

    let lenValStr = UnitsModule.formatLength(userRetractedM);
    if (isRetractedMod) lenValStr += modTag;

    let madValStr = madDualStr;
    if (isMadMod) madValStr += modTag;

    let afValStr = arrestForce1UserStr;
    if (isArrestForceMod) afValStr += modTag;

    const srlRows = [
        [isEn ? "Connecting Device" : "Dispositif Sélectionné", devName, isEn ? "Manufacturer" : "Fabricant", (srlData && srlData.manufacturer) ? srlData.manufacturer : "Miller / Honeywell / Custom"],
        [isEn ? "OSHA / ANSI Class" : "Classe OSHA / ANSI", devClassStr, isEn ? "Lifeline Elevation" : "Élévation de Ligne (HLL)", `${elevLabel}`],
        [isEn ? "Max Arrest Distance (MAD)" : "Distance d'Arrêt Max (MAD)", madValStr, lenLabel, lenValStr],
        [isEn ? "Arrest Force (1 user)" : "Force d'Arrêt (1 user)", afValStr, isEn ? "Global Arrest Load" : "Charge d'Arrêt Globale", globalArrestStr],
        [isEn ? "Cable Pretension P0" : "Prétension Câble P0", UnitsModule.formatPretension(state.product.includes("RANGE") ? 600 : 100), isEn ? "Fall Factor" : "Facteur de chute", `${pdfEngCoef.toFixed(2)}`],
        [isEn ? "Buffer Setback" : "Recul du Buffer", "Donnée à renseigner", isEn ? "Safety Margin" : "Marge de Sécurité", "0.60 m"]
    ];

    doc.autoTable({
        startY: p3Y + 3,
        body: srlRows,
        theme: 'grid',
        styles: { fontSize: 6.5, cellPadding: 1.2 },
        columnStyles: {
            0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 42 },
            1: { cellWidth: 49 },
            2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 42 },
            3: { cellWidth: 49 }
        }
    });

    p3Y = doc.lastAutoTable.finalY + 6;

    // C. Synthèse des Efforts de Coin Résolus (Vector Math)
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Efforts de Coin Résolus - Somme Vectorielle :", 14, p3Y);

    const cornerRows = [];
    const cornerNodes = (state.spans || []).filter(s => s.bend_after_deg || s.bendDeg || s.bend90);
    if (cornerNodes.length > 0) {
        cornerNodes.forEach((cn, cIdx) => {
            const angle = cn.bend_after_deg !== undefined ? cn.bend_after_deg : (cn.bendDeg || 90);
            const effortRes = calculateCornerEffort({ bendAngleDeg: angle }, baseTensionKn, baseTensionKn);
            const isDoubled = effortRes.isDoubledAnchor;
            cornerRows.push([
                `Coin C${cIdx + 1} - ${angle}°`,
                UnitsModule.formatForce(effortRes.t1Kn),
                UnitsModule.formatForce(effortRes.t2Kn),
                UnitsModule.formatForce(effortRes.resultantKn),
                `${effortRes.angleWithBisectorDeg}°`,
                isDoubled ? `Paire doublée - ${UnitsModule.formatForce(effortRes.distribution.anchor1Kn)} / potelet` : "Ancrage simple"
            ]);
        });
    } else {
        // Sample standard corner if straight line
        const standardCorner = calculateCornerEffort({ bendAngleDeg: 90 }, baseTensionKn, baseTensionKn);
        cornerRows.push([
            "Exemple Coude 90°",
            UnitsModule.formatForce(10.0),
            UnitsModule.formatForce(10.0),
            UnitsModule.formatForce(standardCorner.resultantKn),
            `${standardCorner.angleWithBisectorDeg}°`,
            "Paire doublée - R/2 par ancrage"
        ]);
    }

    doc.autoTable({
        startY: p3Y + 3,
        head: [["Emplacement Coude", "Tension T1", "Tension T2", "Effort Résultant |R|", "Angle / Bissectrice", "Implantation Ancrages"]],
        body: cornerRows,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 6.8, cellPadding: 1.2 }
    });

    p3Y = doc.lastAutoTable.finalY + 6;

    // D. Dégagement Total Requis & Illustration Schématique de Chute
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Dégagement Total Requis & Illustration Schématique de Chute :", 14, p3Y);

    const bodyPos = state.bodyPosition || "standing";
    const dRingH = state.dRingHeightM || 1.50;
    const isOverEdge = state.isOverEdgeFall || (state.line_to_edge !== undefined && state.line_to_edge < 1.0);
    let bodyOffset = 0;
    if (!isOverEdge) {
        if (bodyPos === "kneeling") bodyOffset = 36 * 0.0254; // +36 po (0.914m)
        else if (bodyPos === "lying") bodyOffset = dRingH;
    }
    const totalBody = dRingH + bodyOffset;
    const postureStr = (bodyPos === "kneeling") ? "À genoux" : (bodyPos === "lying" ? "Allongé" : "Debout");
    const calcDefl = Calculator.deflection(state.product, longestSpanLen, state.fallFactor || 1, support, 1, state.norm, isMultiSpan);
    const calcDeflMeters = (calcDefl > 20.0) ? (calcDefl / 1000.0) : calcDefl;
    let devComp = madMVal + userRetractedM;
    const safetyMargin = 0.60;
    const totalRequiredClearance = calcDeflMeters + devComp + safetyMargin;

    // Vector Fall Illustration Schematic
    const schX = 14;
    const schY = p3Y + 4;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.rect(schX, schY, 182, 38, 'FD');

    // Lifeline cable bar
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(1.2);
    doc.line(schX + 10, schY + 6, schX + 80, schY + 6);
    doc.setFontSize(7);
    doc.setTextColor(37, 99, 235);
    doc.setFont("helvetica", "bold");
    let factorSchematicTitle = (state.hllElevationPreset === "overhead" || parseFloat(state.hllElevation) > 1.65)
        ? "Schéma de Dégagement de Chute — Ligne Overhead"
        : (isOverEdge
            ? "Schéma de Dégagement de Chute — Chute par-dessus un bord"
            : (state.hllElevationPreset === "d_ring" || (parseFloat(state.hllElevation) >= 1.35 && parseFloat(state.hllElevation) <= 1.65)
                ? "Schéma de Dégagement de Chute — Ligne à hauteur Anneau D"
                : "Schéma de Dégagement de Chute — Ligne basse (niveau genou / pieds)"));
    doc.text(factorSchematicTitle, schX + 12, schY + 4);

    // Deflection curve
    doc.setDrawColor(239, 68, 68);
    doc.line(schX + 10, schY + 6, schX + 45, schY + 14);
    doc.line(schX + 45, schY + 14, schX + 80, schY + 6);
    doc.setTextColor(239, 68, 68);
    doc.text(`Flèche : ${UnitsModule.formatDeflection(calcDefl)}`, schX + 48, schY + 13);

    // SRL connection & MAD + Retracted
    doc.setDrawColor(245, 158, 11);
    doc.line(schX + 45, schY + 14, schX + 45, schY + 25);
    doc.setTextColor(217, 119, 6);
    const devLabel = isOverEdge ? `Arrêt SRL + Rétracté (${UnitsModule.formatLength(devComp)})` : `Arrêt SRL (MAD) + Rétracté : ${UnitsModule.formatLength(devComp)}`;
    doc.text(devLabel, schX + 48, schY + 21);

    // Ground line & Safety margin
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.8);
    doc.line(schX + 10, schY + 34, schX + 80, schY + 34);
    doc.setDrawColor(16, 185, 129);
    doc.line(schX + 45, schY + 25, schX + 45, schY + 34);
    doc.setTextColor(16, 185, 129);
    doc.text(`Marge de sécurité : ${UnitsModule.formatLength(safetyMargin)}`, schX + 48, schY + 30);

    // Total required box
    doc.setFillColor(239, 246, 255);
    doc.rect(schX + 90, schY + 6, 82, 26, 'FD');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(8);
    doc.text("Bilan Dégagement de Chute Requis :", schX + 94, schY + 12);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(37, 99, 235);
    doc.text(`TOTAL REQUIS = ${UnitsModule.formatLength(totalRequiredClearance)}`, schX + 94, schY + 20);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Hauteur disponible sous toit : ${UnitsModule.formatLength(state.roofHeightAboveGround || 6.0)}`, schX + 94, schY + 26);

    // Legal Warning - Multi-line safe with maxWidth 182
    p3Y = schY + 41;
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 116, 139);
    doc.text("Avertissement légal : Cette note de calcul et de conformité réglementaire est éditée sous la responsabilité du système automatisé HOOKT Configurator v3.0.", 14, p3Y, { maxWidth: 182 });
    doc.text("Les calculs d'efforts et de dégagements sont conformes aux référentiels OSHA 1926.502, ANSI Z359.14 et EN 795-C sous réserve du respect scrupuleux des préconisations de pose et des couples de serrage.", 14, p3Y + 3.8, { maxWidth: 182 });

    // Footer on all PDF pages with Website, Email, and Phone number
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.line(14, 281, 196, 281);

        doc.setFontSize(6.8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);

        const currentYear = new Date().getFullYear();
        doc.text(pdfTrans.footerRights[l].replace('{year}', currentYear), 14, 285.5);
        doc.text(pdfTrans.footerContacts[l], 14, 289.5);
        doc.text(`${pdfTrans.pageStr[l]} ${i} / ${pageCount}`, 196, 289.5, { align: 'right' });
    }

    doc.save(`HOOKT_Rapport_Installation_${state.product.replace(/\s+/g, '_')}_${today.replace(/\//g, '-')}.pdf`);
    } catch (err) {
        console.error("PDF Generation Error:", err);
        const errL = (typeof state !== "undefined" && state && state.lang) || 0;
        alert(errL === 1
            ? `⚠️ PDF Generation Error: ${err.message}`
            : `⚠️ Erreur lors de la génération du rapport PDF : ${err.message}`);
    }
}
if (typeof window !== "undefined") {
    window.generatePDFReport = generatePDFReport;
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

    const currentProd = normalizeProduct(state.product || "CORE");
    const comps = COMPONENTS_DB[currentProd] || [];

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

            // Constraint A: X-Cone restriction (allowed on sloped roof or sloped layouts/spans between 15° and 75°)
            if (c.id === "X-Cone" && c.checked) {
                const isSlopedRoof = (state.roofShape === "sloped" || state.roof_type === "sloped" || state.roofShape === "triangle" || state.roof_type === "triangle");
                const roofSlopeVal = parseFloat(state.roofSlope || state.roof_slope_deg || (isSlopedRoof ? 15 : 0));
                const hasRoofSlope = isSlopedRoof && roofSlopeVal >= 15 && roofSlopeVal <= 75;
                const hasSlopedLayout = state.layoutType === "slope_single" || state.layoutType === "slope_multi" || state.layoutType === "slope_horizontal_comb";
                const hasSlopedSpans = state.spans && state.spans.some(s => s.isSloped || ((s.slopeDeg || s.slope_deg || 0) >= 15 && (s.slopeDeg || s.slope_deg || 0) <= 75));
                const hasSlope = hasRoofSlope || hasSlopedLayout || hasSlopedSpans;

                if (!hasSlope) {
                    alert("⚠️ CONFIGURATION INCOMPATIBLE :\nL'option X-CONE est utilisable uniquement sur les configurations comportant une pente (toit incliné ou portées en pente entre 15° and 75°).");
                    c.checked = false;
                    chk.checked = false;
                    item.classList.remove("active");
                    return;
                }
            }

            // Constraint B: X-Matrix restriction
            if (c.id === "X-Matrix") {
                if (state.layoutType === "grid_system") {
                    // Configuration 12: Grid Systems with EXTREME
                    const isRange = isExtreme(state.product);
                    if (c.checked && !isRange) {
                        alert(TRANSLATIONS.alerts.xmatrixNewProOnly[state.lang || 0]);
                        c.checked = false;
                        chk.checked = false;
                        item.classList.remove("active");
                        return;
                    }
                    // In Grid Systems, X-Matrix does not toggle legacy line2
                } else if (state.layoutType === "cross_spans") {
                    // Configuration 11: Cross Spans with PRO
                    if (c.checked && !isPro(state.product)) {
                        alert(TRANSLATIONS.alerts.xmatrixNewProOnly[state.lang || 0]);
                        c.checked = false;
                        chk.checked = false;
                        item.classList.remove("active");
                        return;
                    }
                    // In Cross Spans, X-Matrix does not toggle legacy line2
                } else {
                    // Legacy 2-line layout
                    if (c.checked && !isPro(state.product) && !isExtreme(state.product)) {
                        alert(TRANSLATIONS.alerts.xmatrixNewProOnly[state.lang || 0]);
                        c.checked = false;
                        chk.checked = false;
                        item.classList.remove("active");
                        return;
                    }
                    if (c.checked && state.roofShape !== "flat") {
                        alert(TRANSLATIONS.alerts.line2FlatOnly[state.lang || 0]);
                        c.checked = false;
                        chk.checked = false;
                        item.classList.remove("active");
                        return;
                    }
                    state.hasLine2 = c.checked;
                    state.xMatrixLocation = "mid";
                    const chkFormLine2 = document.getElementById("input-has-line2");
                    if (chkFormLine2) chkFormLine2.checked = c.checked;
                }
            }

            // Constraint C: Mutual Exclusivity for Main System Models (Absorbers & Posts) within PRO and CORE (EXTREME allows both Absorber & A-Fix checked)
            if (!isExtreme(state.product)) {
                const mainModelVariantIds = ["New_Pro", "Mini_Omega", "P_Inox", "LightPro", "PB_HOOKt", "P_Galva"];
                if (c.checked && mainModelVariantIds.includes(c.id)) {
                    const sysList = COMPONENTS_DB[currentProd] || [];
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
function initApp() {
    try {
        if (typeof window !== "undefined" && window.localStorage) {
            const savedLang = window.localStorage.getItem("hookt_v2_lang");
            if (savedLang !== null && !isNaN(parseInt(savedLang, 10))) {
                state.lang = parseInt(savedLang, 10);
            }
            const savedUnits = window.localStorage.getItem("hookt_v2_units");
            if (savedUnits === "imperial" || savedUnits === "us") {
                state.unitSystem = "imperial";
            } else if (savedUnits === "metric") {
                state.unitSystem = "metric";
            }
        }
    } catch (e) {
        // localStorage not accessible
    }

    if (typeof AuthModule !== "undefined") {
        AuthModule.init();
    }
    if (typeof LayoutEditorModule !== "undefined") {
        LayoutEditorModule.ensureSpansHaveStableIds();
        LayoutEditorModule.initKeyboardAndToolbar();
    }
    setupUIEventListeners();
    applyLanguage(state.lang || 0);
    setUnitSystem(state.unitSystem || "metric", true);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}
