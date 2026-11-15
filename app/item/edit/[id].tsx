import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useApp } from '@/store/AppContext';
import { DisposalMethod, DISPOSAL_METHOD_LABELS, BlockedPeriod } from '@/store/types';
import AddressInput from '@/components/AddressInput';
import DatePickerInput from '@/components/DatePickerInput';
import DateRangePicker from '@/components/DateRangePicker';
import AllowedBorrowersInput from '@/components/AllowedBorrowersInput';

async function pickImageWeb(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

const TANGERINE  = '#F26B3A';
const TANG_DEEP  = '#D8531F';
const CREAM      = '#FBF6EE';
const CREAM_2    = '#F4ECDD';
const INK        = '#1F1A17';
const MUTE       = '#847A70';
const BORDER     = '#E8DDD0';

const DISPOSAL_METHODS: DisposalMethod[] = ['charity', 'keep', 'trash'];

type FieldKey = 'title' | 'pickupLocation' | 'pickupWindow' | 'disposalDate' | 'claimPickupHours' | 'allowedBorrowers';
type Errors = Partial<Record<FieldKey, string>>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <View style={styles.errorRow}>
      <FontAwesome name="exclamation-circle" size={13} color={TANG_DEEP} style={{ marginRight: 5 }} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export default function EditItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { items, updateItem, users, currentUser } = useApp();
  const friends = users.filter(u => currentUser.friends.includes(u.id));
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Partial<Record<FieldKey, number>>>({});

  const item = items.find(i => i.id === id);

  if (!item) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>Item not found.</Text>
      </View>
    );
  }

  // Parse ISO disposal date to YYYY-MM-DD for the picker
  const initialDisposalDate = item.disposalDate
    ? item.disposalDate.slice(0, 10)
    : '';

  const [photos, setPhotos] = useState<string[]>(item.photos);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);

  const [restrictions, setRestrictions] = useState(item.restrictions ?? '');
  const [blockedPeriods, setBlockedPeriods] = useState<BlockedPeriod[]>(item.blockedPeriods ?? []);
  const [allowedBorrowers, setAllowedBorrowers] = useState<string[] | undefined>(item.allowedBorrowers);
  const [pickupLocation, setPickupLocation] = useState(item.pickupLocation);
  const [pickupWindow, setPickupWindow] = useState(item.pickupWindow);
  const [disposalDate, setDisposalDate] = useState(initialDisposalDate);
  const [disposalMethod, setDisposalMethod] = useState<DisposalMethod>(() => {
    const m = item.disposalMethod as string;
    if (m === 'trash') return 'trash';
    if (m === 'keep') return 'keep';
    return 'charity'; // goodwill, salvation_army, habitat, food_bank, other_charity → charity
  });
  const [claimPickupDays, setClaimPickupDays] = useState(String(Math.max(1, Math.round(item.claimPickupHours / 24))));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const clearError = (field: FieldKey) => {
    if (errors[field]) setErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  };

  const addPhoto = async () => {
    if (Platform.OS === 'web') {
      const uri = await pickImageWeb();
      if (uri) setPhotos(prev => [...prev, uri]);
      return;
    }
    const ImagePicker = await import('expo-image-picker');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photos Access Needed', 'Allow photo access in Settings to add pictures to your listing.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (asset?.base64) {
      setPhotos(prev => [...prev, `data:image/jpeg;base64,${asset.base64}`]);
    }
  };

  const removePhoto = (index: number) =>
    setPhotos(prev => prev.filter((_, i) => i !== index));

  const handleSubmit = () => {
    const next: Errors = {};

    if (!title.trim())
      next.title = 'Please enter a title for this item.';
    if (!pickupLocation.trim())
      next.pickupLocation = 'Please enter a pickup location.';
    if (!pickupWindow.trim())
      next.pickupWindow = 'Please describe when the item can be picked up.';

    const days = parseInt(claimPickupDays, 10);
    if (item.listingType === 'give') {
      if (!disposalDate.trim())
        next.disposalDate = 'Please choose a disposal date.';
      else if (isNaN(new Date(disposalDate).getTime()))
        next.disposalDate = 'That date doesn\'t look right — pick one from the calendar or type MM-DD-YYYY.';
      if (isNaN(days) || days < 1)
        next.claimPickupHours = 'Please enter a pickup window of at least 1 day.';
      if (!next.disposalDate && !next.claimPickupHours && disposalDate && !isNaN(days)) {
        const daysUntilDisposal = (new Date(disposalDate).getTime() - Date.now()) / 86_400_000;
        if (days >= daysUntilDisposal) {
          next.claimPickupHours = `The pickup window (${days}d) must be shorter than the time until disposal (~${Math.floor(daysUntilDisposal)}d away). Shorten the pickup window or choose a later disposal date.`;
        }
      }
    }

    if (item.listingType === 'borrow' && allowedBorrowers && allowedBorrowers.length === 0)
      next.allowedBorrowers = 'Pick at least one friend, or choose All friends.';

    if (Object.keys(next).length > 0) {
      setErrors(next);
      const order: FieldKey[] = ['title', 'pickupLocation', 'pickupWindow', 'disposalDate', 'claimPickupHours', 'allowedBorrowers'];
      const firstField = order.find(f => next[f]);
      if (firstField && fieldOffsets.current[firstField] !== undefined) {
        scrollRef.current?.scrollTo({ y: fieldOffsets.current[firstField]! - 20, animated: true });
      }
      return;
    }

    setSubmitting(true);
    updateItem(item.id, {
      title: title.trim(),
      description: description.trim(),
      photos,
      restrictions: restrictions.trim() || undefined,
      pickupLocation: pickupLocation.trim(),
      pickupWindow: pickupWindow.trim(),
      ...(item.listingType === 'give' ? {
        disposalDate: new Date(disposalDate).toISOString(),
        disposalMethod,
        claimPickupHours: days * 24,
      } : {
        blockedPeriods,
        // [] clears the restriction (mapped to null in AppContext)
        allowedBorrowers: allowedBorrowers ?? [],
      }),
    });
    router.back();
  };

  const trackOffset = (field: FieldKey) => ({
    onLayout: (e: any) => { fieldOffsets.current[field] = e.nativeEvent.layout.y; },
  });

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Photos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Photos</Text>
        <View style={styles.photoRow}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.photoImg} resizeMode="cover" />
              <Pressable style={styles.removePhoto} onPress={() => removePhoto(i)}>
                <FontAwesome name="times-circle" size={18} color="#e53e3e" />
              </Pressable>
            </View>
          ))}
          {photos.length < 6 && (
            <Pressable style={styles.addPhotoBtn} onPress={addPhoto}>
              <FontAwesome name="camera" size={24} color="#F26B3A" />
              <Text style={styles.addPhotoText}>
                {Platform.OS === 'web' ? 'Upload' : 'Add Photo'}
              </Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.hint}>Up to 6 photos</Text>
      </View>

      {/* Title */}
      <View style={styles.section} {...trackOffset('title')}>
        <Text style={styles.label}>Title <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.input, errors.title && styles.inputError]}
          placeholder="e.g. IKEA KALLAX Bookshelf"
          placeholderTextColor="#a0aec0"
          value={title}
          onChangeText={t => { setTitle(t); clearError('title'); }}
        />
        <FieldError message={errors.title} />
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe the item — dimensions, any wear, what's included…"
          placeholderTextColor="#a0aec0"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      {/* Restrictions */}
      <View style={styles.section}>
        <Text style={styles.label}>Restrictions <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Foster care placements only, pregnant friends only"
          placeholderTextColor="#a0aec0"
          value={restrictions}
          onChangeText={setRestrictions}
        />
      </View>

      {/* Item Location */}
      <View style={[styles.section, { zIndex: 10 }]} {...trackOffset('pickupLocation')}>
        <Text style={styles.label}>Item Location <Text style={styles.required}>*</Text></Text>
        <AddressInput
          value={pickupLocation}
          onChangeText={t => { setPickupLocation(t); clearError('pickupLocation'); }}
          placeholder="e.g. 123 Main St, Springfield"
          error={!!errors.pickupLocation}
        />
        <FieldError message={errors.pickupLocation} />
      </View>

      {/* Pickup Window */}
      <View style={styles.section} {...trackOffset('pickupWindow')}>
        <Text style={styles.label}>Pickup Availability <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.input, errors.pickupWindow && styles.inputError]}
          placeholder="e.g. Weekends 10am–4pm, Evenings after 6pm"
          placeholderTextColor="#a0aec0"
          value={pickupWindow}
          onChangeText={t => { setPickupWindow(t); clearError('pickupWindow'); }}
        />
        <FieldError message={errors.pickupWindow} />
      </View>

      {/* Give: Disposal Date */}
      {item.listingType !== 'borrow' && (
        <View style={[styles.section, { zIndex: 20 }]} {...trackOffset('disposalDate')}>
          <Text style={styles.label}>Disposal Date <Text style={styles.required}>*</Text></Text>
          <Text style={styles.hint}>If no one picks up the item by this date, it will be disposed of.</Text>
          <DatePickerInput
            value={disposalDate}
            onChange={d => { setDisposalDate(d); clearError('disposalDate'); }}
          />
          <FieldError message={errors.disposalDate} />
        </View>
      )}

      {/* Give: Disposal Method */}
      {item.listingType !== 'borrow' && (
        <View style={styles.section}>
          <Text style={styles.label}>If unclaimed, goes to… <Text style={styles.required}>*</Text></Text>
          <View style={styles.chipRow}>
            {DISPOSAL_METHODS.map(m => (
              <Pressable
                key={m}
                style={[styles.chip, disposalMethod === m && styles.chipActive]}
                onPress={() => setDisposalMethod(m)}
              >
                <Text style={[styles.chipText, disposalMethod === m && styles.chipTextActive]}>
                  {DISPOSAL_METHOD_LABELS[m]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Give: Claim Pickup Days */}
      {item.listingType !== 'borrow' && (
        <View style={styles.section} {...trackOffset('claimPickupHours')}>
          <Text style={styles.label}>Days to pick up after claiming <Text style={styles.required}>*</Text></Text>
          <Text style={styles.hint}>How long does a donee have to arrange pickup before the next person on the waitlist is asked?</Text>
          <View style={styles.row}>
            {['1', '2', '3', '4'].map(d => (
              <Pressable
                key={d}
                style={[styles.chip, claimPickupDays === d && styles.chipActive]}
                onPress={() => { setClaimPickupDays(d); clearError('claimPickupHours'); }}
              >
                <Text style={[styles.chipText, claimPickupDays === d && styles.chipTextActive]}>
                  {d}d
                </Text>
              </Pressable>
            ))}
            <TextInput
              style={[styles.input, styles.hoursInput, errors.claimPickupHours && styles.inputError]}
              placeholder="Custom"
              placeholderTextColor="#a0aec0"
              value={['1', '2', '3', '4'].includes(claimPickupDays) ? '' : claimPickupDays}
              onChangeText={t => { setClaimPickupDays(t); clearError('claimPickupHours'); }}
              keyboardType="numeric"
            />
          </View>
          <FieldError message={errors.claimPickupHours} />
        </View>
      )}

      {/* Borrow: Who can borrow */}
      {item.listingType === 'borrow' && (
        <View style={styles.section} {...trackOffset('allowedBorrowers')}>
          <Text style={styles.label}>Who can borrow this?</Text>
          <AllowedBorrowersInput
            value={allowedBorrowers}
            onChange={ids => { setAllowedBorrowers(ids); clearError('allowedBorrowers'); }}
            friends={friends}
            error={errors.allowedBorrowers}
          />
        </View>
      )}

      {/* Borrow: Blocked Periods */}
      {item.listingType === 'borrow' && (
        <View style={styles.section}>
          <Text style={styles.label}>Block Out Dates <Text style={styles.optional}>(optional)</Text></Text>
          <Text style={styles.hint}>Add periods when this item is unavailable — e.g. vacations, scheduled use.</Text>
          {blockedPeriods.map((p, i) => (
            <View key={i} style={styles.blockedPeriodRow}>
              <FontAwesome name="ban" size={12} color="#a0aec0" style={{ marginRight: 6 }} />
              <Text style={styles.blockedPeriodText}>
                {new Date(p.start + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' – '}
                {new Date(p.end + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
              <Pressable onPress={() => setBlockedPeriods(prev => prev.filter((_, j) => j !== i))} style={{ marginLeft: 'auto' }}>
                <FontAwesome name="times" size={14} color="#a0aec0" />
              </Pressable>
            </View>
          ))}
          <DateRangePicker
            startDate=''
            endDate=''
            onChange={(start, end) => {
              if (start && end) setBlockedPeriods(prev => [...prev, { start, end }]);
            }}
          />
        </View>
      )}

      {/* Save */}
      <Pressable
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <FontAwesome name="check" size={16} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.submitBtnText}>Save Changes</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  content: { paddingBottom: 40 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: 16, color: MUTE },
  section: {
    backgroundColor: CREAM_2,
    marginTop: 10,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: INK, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '700', color: INK, marginBottom: 6 },
  required: { color: TANG_DEEP },
  optional: { color: MUTE, fontWeight: '400', fontSize: 13 },
  hint: { fontSize: 12, color: MUTE, marginBottom: 8 },
  input: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: INK,
    backgroundColor: CREAM,
  },
  inputError: {
    borderColor: TANG_DEEP,
    backgroundColor: '#FFF5F0',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  errorText: {
    fontSize: 13,
    color: TANG_DEEP,
    flex: 1,
  },
  textArea: { minHeight: 100, paddingTop: 10 },
  hoursInput: { flex: 1, minWidth: 70 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  photoThumb: { position: 'relative' },
  photoImg: { width: 90, height: 90, borderRadius: 10 },
  removePhoto: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: CREAM,
    borderRadius: 10,
  },
  addPhotoBtn: {
    width: 90,
    height: 90,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: TANGERINE,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addPhotoText: { fontSize: 12, color: TANGERINE, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: CREAM,
  },
  chipActive: { backgroundColor: TANGERINE, borderColor: TANGERINE },
  chipText: { fontSize: 13, color: INK, fontWeight: '600' },
  chipTextActive: { color: CREAM },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TANGERINE,
    margin: 16,
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: TANG_DEEP,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 17, fontWeight: '800', color: CREAM },
  blockedPeriodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CREAM,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  blockedPeriodText: { fontSize: 13, color: INK, fontWeight: '600' },
});
