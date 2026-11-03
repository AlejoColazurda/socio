import type { ActionType, Customer, Product, ResolvedAction } from "../types";

/**
 * Un Connector traduce las acciones de Socio a un sistema concreto (ERP, CRM, SaaS, planilla).
 * Socio nunca escribe en el sistema sin pasar antes por verificación y, si corresponde, aprobación.
 */
export interface Connector {
  id: string;
  name: string;
  /** Acciones que este sistema sabe ejecutar. El resto se bloquea en verificación. */
  capabilities: ActionType[];
  /** true si las escrituras están deshabilitadas (se simulan y se informa). */
  readOnly: boolean;
  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  listCustomers(): Promise<Customer[]>;
  execute(action: ResolvedAction): Promise<string>;
}
