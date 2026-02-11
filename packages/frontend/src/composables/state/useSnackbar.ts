import { useToast } from 'primevue/usetoast';

export function useSnackbar() {
  const toast = useToast();

  return {
    success(message: string) {
      toast.add({ severity: 'success', summary: message, life: 4000 });
    },
    error(message: string) {
      toast.add({ severity: 'error', summary: 'Error', detail: message, life: 10000 });
    },
    warning(message: string) {
      toast.add({ severity: 'warn', summary: message, life: 6000 });
    },
    info(message: string) {
      toast.add({ severity: 'info', summary: message, life: 6000 });
    },
  };
}
