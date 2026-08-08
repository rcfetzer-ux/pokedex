import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  CONDITIONS,
  GRADING_COMPANIES,
  formatCents,
  variantLabel,
  type CardWithSet,
  type Condition,
  type GradingCompany,
  type PriceVariant,
} from '@pokedex/shared';

import { api } from '../api/client';
import { describeError } from '../api/hooks';
import { colors, radius, spacing } from '../theme';
import { Button } from './common';

export interface AddToCollectionProps {
  card: CardWithSet | null;
  suggestedPriceCents?: number | null;
  onClose: () => void;
  onAdded: () => void;
}

/**
 * Confirmation sheet between "we think this is the card" and "it is in your
 * collection". Variant and grade are asked for rather than guessed: they can
 * swing a card's value by 10x and no scan can read them off the artwork.
 */
export function AddToCollection({
  card,
  suggestedPriceCents,
  onClose,
  onAdded,
}: AddToCollectionProps) {
  const [variant, setVariant] = useState<PriceVariant | null>(null);
  const [condition, setCondition] = useState<Condition>('NM');
  const [gradingCompany, setGradingCompany] = useState<GradingCompany | null>(null);
  const [grade, setGrade] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [pricePaid, setPricePaid] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!card) return null;

  const variants = card.variants.length > 0 ? card.variants : (['normal'] as PriceVariant[]);
  const chosenVariant = variant ?? variants[0]!;

  async function submit() {
    if (!card) return;
    setSaving(true);
    setError(null);
    try {
      await api.addToInventory({
        cardId: card.id,
        variant: chosenVariant,
        condition: gradingCompany ? 'NM' : condition,
        gradingCompany,
        grade: gradingCompany && grade ? Number(grade) : null,
        quantity: Math.max(1, parseInt(quantity, 10) || 1),
        acquiredPriceCents: parsePriceToCents(pricePaid),
      });
      onAdded();
      reset();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setVariant(null);
    setCondition('NM');
    setGradingCompany(null);
    setGrade('');
    setQuantity('1');
    setPricePaid('');
    setError(null);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <Text style={styles.title}>{card.name}</Text>
            <Text style={styles.subtitle}>
              {card.set.name} · #{card.number}
              {card.set.printedTotal ? `/${card.set.printedTotal}` : ''}
              {suggestedPriceCents != null ? ` · ${formatCents(suggestedPriceCents)}` : ''}
            </Text>

            <Field label="Printing">
              <ChipRow
                options={variants.map((value) => ({ value, label: variantLabel(value) }))}
                selected={chosenVariant}
                onSelect={(value) => setVariant(value as PriceVariant)}
              />
            </Field>

            <Field label="Graded">
              <ChipRow
                options={[
                  { value: 'raw', label: 'Raw' },
                  ...GRADING_COMPANIES.map((value) => ({ value, label: value })),
                ]}
                selected={gradingCompany ?? 'raw'}
                onSelect={(value) =>
                  setGradingCompany(value === 'raw' ? null : (value as GradingCompany))
                }
              />
            </Field>

            {gradingCompany ? (
              <Field label="Grade">
                <TextInput
                  style={styles.input}
                  value={grade}
                  onChangeText={setGrade}
                  keyboardType="decimal-pad"
                  placeholder="10"
                  placeholderTextColor={colors.textFaint}
                />
              </Field>
            ) : (
              <Field label="Condition">
                <ChipRow
                  options={CONDITIONS.map((value) => ({ value, label: value }))}
                  selected={condition}
                  onSelect={(value) => setCondition(value as Condition)}
                />
              </Field>
            )}

            <View style={styles.row}>
              <Field label="Quantity" style={styles.flex}>
                <TextInput
                  style={styles.input}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="number-pad"
                  placeholderTextColor={colors.textFaint}
                />
              </Field>
              <Field label="Price paid (each)" style={styles.flex}>
                <TextInput
                  style={styles.input}
                  value={pricePaid}
                  onChangeText={setPricePaid}
                  keyboardType="decimal-pad"
                  placeholder="optional"
                  placeholderTextColor={colors.textFaint}
                />
              </Field>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <View style={styles.flex}>
                <Button label="Cancel" variant="secondary" onPress={onClose} />
              </View>
              <View style={styles.flex}>
                <Button
                  label={saving ? 'Adding…' : 'Add to collection'}
                  onPress={submit}
                  disabled={saving}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** "12.50" and "$12.50" both mean 1250 cents; anything unparseable means unknown. */
export function parsePriceToCents(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ChipRow({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          style={[styles.chip, selected === option.value && styles.chipSelected]}
          onPress={() => onSelect(option.value)}
        >
          <Text
            style={[styles.chipText, selected === option.value && styles.chipTextSelected]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    maxHeight: '88%',
  },
  sheetContent: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 13 },
  field: { gap: spacing.xs },
  fieldLabel: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: '#1A1206' },
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
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  error: { color: colors.down, fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
