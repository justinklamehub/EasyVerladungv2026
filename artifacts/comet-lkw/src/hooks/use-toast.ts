import { toast as sonnerToast } from "sonner";

type ToastParams = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
};

export function useToast() {
  const toast = ({ title, description, variant }: ToastParams) => {
    if (variant === "destructive") {
      sonnerToast.error(title, { description });
    } else {
      sonnerToast.success(title, { description });
    }
  };
  return { toast };
}

export { sonnerToast as toast };
