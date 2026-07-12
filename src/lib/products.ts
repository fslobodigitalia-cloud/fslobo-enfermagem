export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  oldPrice?: number;
  discount?: number;
  rating: number;
  sales: number;
  image: string;
  tag?: "novo" | "topvendas" | "lancamento";
  description: string;
  benefits: string[];
};