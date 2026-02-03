import { RetryLink } from '@apollo/client/link/retry'

export const retryLink = new RetryLink({
  delay: {
    initial: 1000,
    max: 10000,
    jitter: true,
  },
  attempts: {
    max: 3,
    retryIf: (error) => !!error,
  },
});
