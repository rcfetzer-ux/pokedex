import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { api, UnauthorizedError } from '../api/client';
import { clearToken, loadToken, saveToken } from '../api/auth';
import { describeError } from '../api/hooks';
import { colors, radius, spacing } from '../theme';
import { Button, Loading, Screen } from './common';

type State = 'checking' | 'needs-token' | 'ready' | 'unreachable';

/**
 * Stands between app start and the tabs when the server requires a token.
 *
 * A deployed server rejects everything without a credential, so without this
 * every screen would independently render "something went wrong" and none of
 * them could explain that the fix is entering a token.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>('checking');
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setState('checking');
    setError(null);
    try {
      await loadToken();
      await api.authCheck();
      setState('ready');
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        setState('needs-token');
      } else {
        setError(describeError(caught));
        setState('unreachable');
      }
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  if (state === 'checking') return <Loading label="Connecting…" />;
  if (state === 'ready') return <>{children}</>;

  if (state === 'unreachable') {
    return (
      <Screen>
        <View style={styles.wrap}>
          <Text style={styles.title}>Can't reach the server</Text>
          <Text style={styles.body}>{error}</Text>
          <Button label="Try again" onPress={check} />
        </View>
      </Screen>
    );
  }

  return <TokenPrompt onDone={check} />;
}

function TokenPrompt({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await saveToken(token.trim());
      // Validate before settling on it, so a typo says so here rather than
      // turning every later screen into an error.
      await api.authCheck();
      onDone();
    } catch (caught) {
      await clearToken();
      setError(
        caught instanceof UnauthorizedError
          ? 'That token was not accepted.'
          : describeError(caught),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={styles.wrap}>
        <Text style={styles.title}>Access token</Text>
        <Text style={styles.body}>
          This server is protected. Paste the token it was started with (the value of API_TOKEN).
        </Text>

        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setToken}
          placeholder="paste token"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          onSubmitEditing={submit}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={submitting ? 'Checking…' : 'Continue'}
          onPress={submit}
          disabled={submitting || token.trim().length === 0}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  error: { color: colors.down, fontSize: 13 },
});
