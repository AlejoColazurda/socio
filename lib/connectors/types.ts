import type { ActionType, Customer, Expense, Order, Product, ResolvedAction } from "../types";

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
  /** Opcionales: solo para mostrar en el panel lo que el sistema registró. */
  listOrders?(): Promise<Order[]>;
  listExpenses?(): Promise<Expense[]>;
  execute(action: ResolvedAction): Promise<string>;
}
