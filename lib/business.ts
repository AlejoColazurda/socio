import { getKv } from "./kv";
import type { Customer, Product } from "./types";

// Perfil del negocio: Socio no está atado a un rubro. El perfil le dice al planificador cómo habla
// ese negocio (bultos vs. unidades, clientes que son vecinos o comercios, si fía o toma pedidos) y
// fija la política de aprobación. Se elige con SOCIO_BUSINESS (plantilla) y se pisa con variables.

export interface BusinessProfile {
  id: string;
  name: string;
  rubro: string;
  /** Cómo nombra el negocio a lo que vende: "productos", "artículos", "repuestos"... */
  itemsWord: string;
  /** Cómo nombra a sus clientes: "clientes", "comercios", "vecinos"... */
  customersWord: string;
  /** Contexto libre para el planificador: modismos, unidades, forma de trabajo. */
  notes: string;
  /** Ventas en efectivo hasta este monto se cargan sin pedir OK. */
  autoLimit: number;
  examples: string[];
}

export interface BusinessTemplate {
  profile: BusinessProfile;
  products: Product[];
  customers: Customer[];
}

const kiosco: BusinessTemplate = {
  profile: {
    id: "kiosco",
    name: "Maxikiosco 24/7",
    rubro: "maxikiosco / almacén de barrio",
    itemsWord: "productos",
    customersWord: "clientes",
    notes: "Vende por unidad en mostrador y compra por caja al distribuidor. Fía a vecinos de confianza.",
    autoLimit: 20000,
    examples: [
      "llegaron dos cajas de playadito",
      "vendí 2 fernet fiado a ruben",
      "el taller me pagó 10 lucas",
      "subile la coca grande a 4500",
      "pagué 38 lucas de luz",
      "cuántas oreo quedan?",
    ],
  },
  products: [
    { id: "p-yerba-playadito-1k", name: "Yerba Playadito 1 kg", brand: "Playadito", price: 5200, stock: 14, unitsPerPack: 10, aliases: ["playadito", "yerba playadito"] },
    { id: "p-yerba-taragui-1k", name: "Yerba Taragüi 1 kg", brand: "Taragüi", price: 4800, stock: 9, unitsPerPack: 10, aliases: ["taragui", "taragüi"] },
    { id: "p-coca-225", name: "Coca-Cola 2,25 L", brand: "Coca-Cola", price: 3900, stock: 24, unitsPerPack: 6, aliases: ["coca", "coca cola", "coca grande", "coca de dos y cuarto"] },
    { id: "p-coca-500", name: "Coca-Cola 500 ml", brand: "Coca-Cola", price: 1600, stock: 40, unitsPerPack: 12, aliases: ["coca chica", "coquita"] },
    { id: "p-cindor-1l", name: "Leche chocolatada Cindor 1 L", brand: "Cindor", price: 2900, stock: 12, unitsPerPack: 12, aliases: ["cindor"] },
    { id: "p-leche-serenisima-1l", name: "Leche La Serenísima 1 L", brand: "La Serenísima", price: 1700, stock: 18, unitsPerPack: 12, aliases: ["leche", "serenisima", "la serenisima"] },
    { id: "p-alfajor-guaymallen", name: "Alfajor Guaymallén", brand: "Guaymallén", price: 450, stock: 60, unitsPerPack: 40, aliases: ["guaymallen", "alfajor"] },
    { id: "p-alfajor-jorgito", name: "Alfajor Jorgito", brand: "Jorgito", price: 700, stock: 36, unitsPerPack: 24, aliases: ["jorgito"] },
    { id: "p-galletitas-oreo", name: "Galletitas Oreo 118 g", brand: "Oreo", price: 1500, stock: 20, unitsPerPack: 24, aliases: ["oreo"] },
    { id: "p-fernet-branca-750", name: "Fernet Branca 750 ml", brand: "Branca", price: 14500, stock: 6, unitsPerPack: 6, aliases: ["fernet", "branca"] },
    { id: "p-cerveza-quilmes-1l", name: "Cerveza Quilmes 1 L", brand: "Quilmes", price: 2600, stock: 30, unitsPerPack: 12, aliases: ["quilmes", "birra", "cerveza"] },
    { id: "p-pan-lactal-bimbo", name: "Pan lactal Bimbo", brand: "Bimbo", price: 3100, stock: 8, aliases: ["pan lactal", "bimbo"] },
    { id: "p-cigarrillos-marlboro", name: "Marlboro box 20", brand: "Marlboro", price: 4200, stock: 50, unitsPerPack: 10, aliases: ["marlboro", "puchos"] },
    { id: "p-agua-villavicencio-2l", name: "Agua Villavicencio 2 L", brand: "Villavicencio", price: 1400, stock: 22, unitsPerPack: 6, aliases: ["agua", "villavicencio"] },
    { id: "p-azucar-ledesma-1k", name: "Azúcar Ledesma 1 kg", brand: "Ledesma", price: 1300, stock: 15, unitsPerPack: 10, aliases: ["azucar", "ledesma"] },
  ],
  customers: [
    { id: "c-ruben", name: "Rubén (el de la esquina)", balance: 6400 },
    { id: "c-marta", name: "Marta Gómez", balance: 0 },
    { id: "c-taller", name: "Taller Los Pibes", balance: 18200 },
  ],
};

const distribuidora: BusinessTemplate = {
  profile: {
    id: "distribuidora",
    name: "Distribuidora del Norte",
    rubro: "distribuidora mayorista de bebidas y almacén",
    itemsWord: "artículos",
    customersWord: "comercios",
    notes:
      "Vende por bulto a kioscos y almacenes, toma pedidos por WhatsApp para repartir en la semana y maneja cuenta corriente con cada comercio. " +
      "Los vendedores en la calle mandan audios con los pedidos.",
    autoLimit: 0,
    examples: [
      "el almacén don pepe pide 5 bultos de coca grande para el jueves",
      "llegó el camión con 40 bultos de quilmes",
      "kiosco la esquina me transfirió 120 lucas",
      "subile la playadito a 49 mil el bulto",
      "pagué 85 lucas de combustible",
      "cuántos bultos de fernet quedan?",
    ],
  },
  products: [
    { id: "d-coca-225-x6", name: "Coca-Cola 2,25 L (bulto x6)", brand: "Coca-Cola", price: 21000, stock: 120, aliases: ["coca", "coca grande", "bulto de coca"] },
    { id: "d-quilmes-1l-x12", name: "Cerveza Quilmes 1 L (cajón x12)", brand: "Quilmes", price: 27600, stock: 80, aliases: ["quilmes", "cajon de quilmes", "birra"] },
    { id: "d-playadito-x10", name: "Yerba Playadito 1 kg (bulto x10)", brand: "Playadito", price: 46000, stock: 35, aliases: ["playadito", "yerba"] },
    { id: "d-fernet-x6", name: "Fernet Branca 750 ml (caja x6)", brand: "Branca", price: 79000, stock: 12, aliases: ["fernet", "branca"] },
    { id: "d-agua-x6", name: "Agua Villavicencio 2 L (pack x6)", brand: "Villavicencio", price: 7400, stock: 60, aliases: ["agua", "villavicencio"] },
    { id: "d-aceite-x12", name: "Aceite Natura 1,5 L (caja x12)", brand: "Natura", price: 52000, stock: 18, aliases: ["aceite", "natura"] },
  ],
  customers: [
    { id: "dc-donpepe", name: "Almacén Don Pepe", balance: 184000 },
    { id: "dc-laesquina", name: "Kiosco La Esquina", balance: 96500 },
    { id: "dc-superluz", name: "Autoservicio Luz", balance: 0 },
  ],
};

const ferreteria: BusinessTemplate = {
  profile: {
    id: "ferreteria",
    name: "Ferretería San Martín",
    rubro: "ferretería y corralón",
    itemsWord: "artículos",
    customersWord: "clientes",
    notes: "Vende por unidad, metro o bolsa. Tiene cuenta corriente con plomeros, electricistas y constructoras.",
    autoLimit: 50000,
    examples: [
      "vendí 3 bolsas de cemento fiado a la constructora ruiz",
      "llegaron 2 cajas de tornillos de 8",
      "el plomero gómez pagó 60 lucas",
      "subile el cemento a 11500",
      "cuántas bolsas de cal quedan?",
    ],
  },
  products: [
    { id: "f-cemento-50", name: "Cemento Loma Negra 50 kg", brand: "Loma Negra", price: 10200, stock: 40, aliases: ["cemento", "loma negra", "bolsa de cemento"] },
    { id: "f-cal-25", name: "Cal Cacique 25 kg", brand: "Cacique", price: 6900, stock: 25, aliases: ["cal", "bolsa de cal"] },
    { id: "f-tornillo-8", name: "Tornillo autoperforante 8 x 1\" (x100)", price: 4300, stock: 30, unitsPerPack: 20, aliases: ["tornillos de 8", "tornillo de 8", "autoperforantes"] },
    { id: "f-cable-2-5", name: "Cable unipolar 2,5 mm (rollo 100 m)", price: 68000, stock: 9, aliases: ["cable", "cable de 2,5", "rollo de cable"] },
    { id: "f-canio-pvc-110", name: "Caño PVC 110 mm x 4 m", price: 15800, stock: 22, aliases: ["caño de 110", "caño pvc", "caño"] },
  ],
  customers: [
    { id: "fc-ruiz", name: "Constructora Ruiz", balance: 412000 },
    { id: "fc-gomez", name: "Plomero Gómez", balance: 87000 },
    { id: "fc-elec", name: "Electricidad Benítez", balance: 0 },
  ],
};

export const TEMPLATES: Record<string, BusinessTemplate> = { kiosco, distribuidora, ferreteria };

const KEY = "business-template";

/** Rubro activo: el que se eligió en el panel (guardado en el KV) o SOCIO_BUSINESS. */
export async function getTemplate(): Promise<BusinessTemplate> {
  const chosen = await getKv().get<string>(KEY);
  return TEMPLATES[chosen ?? ""] ?? TEMPLATES[process.env.SOCIO_BUSINESS ?? "kiosco"] ?? kiosco;
}

export async function setTemplate(id: string) {
  if (!TEMPLATES[id]) throw new Error(`Rubro desconocido: ${id}`);
  await getKv().set(KEY, id);
}

/** Perfil activo: la plantilla elegida, con lo que se configure por variables de entorno encima. */
export async function getProfile(): Promise<BusinessProfile> {
  const base = (await getTemplate()).profile;
  const env = process.env;
  return {
    ...base,
    name: env.SOCIO_BUSINESS_NAME || base.name,
    rubro: env.SOCIO_BUSINESS_RUBRO || base.rubro,
    notes: env.SOCIO_BUSINESS_NOTES || base.notes,
    autoLimit: env.SOCIO_AUTO_LIMIT !== undefined ? Number(env.SOCIO_AUTO_LIMIT) : base.autoLimit,
  };
}
