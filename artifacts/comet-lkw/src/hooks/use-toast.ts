import { toast as sonnerToast } from "sonner";

type ToastParams = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
};

export function useToast() {
  const toast = ({ title, description, variant }: ToastParams) => {
    let id: string | number;
    const options = {
      description,
      onClick: () => sonnerToast.dismiss(id),
    };
    if (variant === "destructive") {
      id = sonnerToast.error(title, options);
    } else {
      id = sonnerToast.success(title, options);
    }
  };
  return { toast };
}

export { sonnerToast as toast };
