import { AppState, Chapter, Group, Column } from "./types";

const uid = () => Math.random().toString(36).substring(2, 9);

const mkCh = (name: string): Chapter => ({
  id: uid(),
  name,
  checks: {},
  notes: [],
});

const mkGroup = (id: string, label: string, names: string[]): Group => ({
  id,
  label,
  chapters: names.map(mkCh),
  columns: [...DEFAULT_COLUMNS],
});

export const DEFAULT_COLUMNS: Column[] = [
  { id: "study", name: "Studied", isDefault: true, countsForPct: true },
  { id: "test", name: "Tested", isDefault: true, countsForPct: true },
];

export const DEFAULTS: AppState = {
  data: {
    physics: {
      color: "var(--phy)",
      bg: "var(--phy-lt)",
      groups: [
        mkGroup("p11", "11th Class", [
          "Units & Dimension",
          "Errors",
          "Vectors",
          "Kinematics",
          "Newton Laws of Motion",
          "Friction",
          "Circular Motion",
          "Work, Energy and Power",
          "Centre of Mass, Momentum and Collision",
          "Rotational Motion",
          "Simple Harmonic Motion & Oscillation",
          "Sound Wave",
          "Fluid Mechanics, Thermal Expansion & Elasticity",
          "Thermometry, Calorimetry, KTG & Thermodynamics",
          "Heat Transfer",
          "Gravitation",
        ]),
        mkGroup("p12", "12th Class", [
          "Electrostatics",
          "Gauss Law & Conductors",
          "Current Electricity",
          "Capacitors",
          "Moving Charges and Magnetism",
          "Magnetism & Matter",
          "Electromagnetic Induction",
          "AC & EM",
          "Geometrical Optics & Optical Instruments",
          "Wave Optics",
          "Modern Physics",
          "Nuclear Physics",
          "Semiconductors",
        ]),
      ],
    },
    chemistry: {
      color: "var(--chem)",
      bg: "var(--chem-lt)",
      groups: [
        mkGroup("cp11", "Physical — 11th", [
          "Mole Concept, Concentration & Stoichiometry",
          "Atomic Structure",
          "Chemical Equilibrium",
          "Redox Reaction",
          "Ionic Equilibrium",
        ]),
        mkGroup("cp12", "Physical — 12th", [
          "Chemical Kinetics",
          "Thermodynamics",
          "Thermochemistry",
          "Electro Chemistry",
          "Liquid State",
        ]),
        mkGroup("ci11", "Inorganic — 11th", [
          "Quantum Numbers & Electronic Configuration",
          "Periodic Table and Periodic Classification",
          "Chemical Bonding",
        ]),
        mkGroup("ci12", "Inorganic — 12th", [
          "Metallurgy (not coming)",
          "Co-ordinate Compounds",
          "Types of Chemical Rxn.",
          "Salt Analysis",
          "p-Block Elements",
          "D & F-Block",
          "Hydrogen and its Compound, S-Block (not)",
        ]),
        mkGroup("co11", "Organic — 11th", [
          "Basics Of Organic Chemistry",
          "IUPAC Nomenclature",
          "Isomerism",
          "GOC",
          "Mechanism & Hydrocarbon",
        ]),
        mkGroup("co12", "Organic — 12th", [
          "Haloalkanes & Haloarenes",
          "Grignard Reagents & OMC",
          "Alcohol, Phenols & Ethers",
          "Aldehydes & Ketones",
          "Caboxylic Acid and Its Derivatives",
          "Amines & N-Containing Compound",
        ]),
      ],
    },
    mathematics: {
      color: "var(--math)",
      bg: "var(--math-lt)",
      groups: [
        mkGroup("m11", "11th Class", [
          "Sets",
          "Standard Functions",
          "Logarithms",
          "Permutation and Combination",
          "Binomial Theorem",
          "Sequence and Series",
          "Complex Numbers",
          "Quadratic Equation",
          "Trigonometry",
          "Straight Line",
          "Circles",
          "Parabola",
          "Ellipse",
          "Hyperbola",
          "Statistics",
          "Limits",
        ]),
        mkGroup("m12", "12th Class", [
          "Matrices",
          "Determinants",
          "Relation & Functions",
          "Inverse Trigonometry Functions",
          "Continuity & Differentiability",
          "Differentiation",
          "Application of Derivatives",
          "Indefinite Integration",
          "Definite Integration",
          "Area Under the Curve",
          "Differential Equations",
          "Vector Algebra",
          "3D-Coordinate Geometry",
          "Probability",
        ]),
      ],
    },
  },
};
