import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLatestBriefing, updateBriefingSection, approveBriefing } from '@/lib/api';
import { toast } from 'sonner';

export function useBriefing(nightDate, options = {}) {
  return useQuery({
    queryKey: ['briefing', nightDate],
    queryFn: () => getLatestBriefing(nightDate),
    // Only poll when generating; stop when draft/approved/failed
    refetchInterval: (query) => {
      const status = query?.state?.data?.status;
      if (!status || status === 'draft' || status === 'approved' || status === 'failed') return false;
      return 5000; // 5s while generating
    },
    select: (data) => {
      if (!data) return { briefing: null, isApproved: false, canApprove: false };
      return {
        briefing: data,
        isApproved: data.status === 'approved',
        canApprove: data.status === 'draft',
      };
    },
    retry: (failureCount, error) => {
      if (error?.statusCode === 401 || error?.statusCode === 403) return false;
      if (!error?.statusCode) return failureCount < 3;
      return failureCount < 1;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options,
  });
}

export function useUpdateBriefingSection(options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ briefingId, sectionName, content }) =>
      updateBriefingSection(briefingId, { sectionName, content }),
    onError: (err) => {
      toast.error(`Briefing update failed: ${err.message}`);
      if (options.onError) options.onError(err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['briefing'] });
    },
    ...options,
  });
}

export function useApproveBriefing(options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (briefingId) => approveBriefing(briefingId),
    onSuccess: (result, variables, context) => {
      toast.success('Briefing approved — ready for 8:00 AM review', { duration: 5000 });
      queryClient.invalidateQueries({ queryKey: ['briefing'] });
      if (options.onSuccess) options.onSuccess(result, variables, context);
    },
    onError: (error) => {
      toast.error(`Approval failed: ${error.message}`);
      if (options.onError) options.onError(error);
    },
    ...options,
  });
}
