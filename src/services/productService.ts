import { supabase } from "./supabaseClient";
import type { Product } from "../types";

export const productService = {
  // Get all products (both active and inactive)
  async getAllProducts(): Promise<Product[]> {
    try {
      const { data: products, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading products:", error);
        return [];
      }

      return products || [];
    } catch (error) {
      console.error("Error in getAllProducts:", error);
      return [];
    }
  },

  // Get active products only
  async getActiveProducts(): Promise<Product[]> {
    try {
      const { data: products, error } = await supabase
        .from("products")
        .select("*")
        .eq("status", "active")
        .order("is_predefined", { ascending: false }) // Predefined first
        .order("name", { ascending: true });

      if (error) {
        console.error("Error loading active products:", error);
        return [];
      }

      return products || [];
    } catch (error) {
      console.error("Error in getActiveProducts:", error);
      return [];
    }
  },

  // Create new product
  async createProduct(productData: {
    name: string;
    description?: string;
    default_rate?: number;
    is_predefined?: boolean;
  }): Promise<Product | null> {
    try {
      const { data: product, error } = await supabase
        .from("products")
        .insert([
          {
            ...productData,
            status: "active",
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Error creating product:", error);
        throw error;
      }

      return product;
    } catch (error) {
      console.error("Error in createProduct:", error);
      throw error;
    }
  },

  // Update product
  async updateProduct(
    id: string,
    updates: Partial<Product>
  ): Promise<Product | null> {
    try {
      const { data: product, error } = await supabase
        .from("products")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error updating product:", error);
        throw error;
      }

      return product;
    } catch (error) {
      console.error("Error in updateProduct:", error);
      throw error;
    }
  },

  // Delete product completely (hard delete)
  async deleteProduct(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", id)
        .eq("is_predefined", false); // Only delete non-predefined products

      if (error) {
        console.error("Error deleting product:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error in deleteProduct:", error);
      throw error;
    }
  },
};
