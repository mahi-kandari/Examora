import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../services/firebase';
import { confirmExam } from '../services/exam';
import { AlertTriangle, MapPin, ChevronDown } from 'lucide-react';

const STORED_ORIGIN_KEY = 'examora_user_origin';
const STORED_LOCATION_PERMISSION_KEY = 'examora_location_permission';

const fieldConfig = [
  { key: 'exam_title', label: 'Exam Title' },
  { key: 'exam_date', label: 'Exam Date (DD-MM-YYYY)' },
  { key: 'exam_start_time', label: 'Exam Start Time' },
  { key: 'reporting_time', label: 'Reporting Time' },
  { key: 'center_name', label: 'Centre Name' },
  { key: 'center_address', label: 'Centre Address' },
  { key: 'gate_details', label: 'Gate Details' },
  { key: 'required_documents', label: 'Required Documents' },
  { key: 'instructions', label: 'Instructions' },
] as const;

// --- Helpers (unchanged) ---
function normalizeArrayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return JSON.stringify(value, null, 2);
}

function deriveFieldData(data: Record<string, any>) {
  const center = data?.center || '';
  const [centerName = '', ...centerAddressParts] =
    typeof center === 'string' ? center.split(',') : [''];
  return {
    exam_title: data?.exam_title || '',
    exam_date: data?.exam_date || '',
    exam_start_time: data?.exam_start_time || '',
    reporting_time: data?.reporting_time || '',
    center_name: (data?.center_name || centerName || '').trim(),
    center_address: (data?.center_address || centerAddressParts.join(',') || '').trim(),
    gate_details: data?.gate_details || '',
    required_documents: normalizeArrayValue(data?.required_documents),
    instructions: normalizeArrayValue(data?.extracted_instructions || data?.instructions),
  };
}

function getConfidenceMap(data: Record<string, any>) {
  return data?.confidence || data?.confidence_scores || {};
}

function getConfidenceValue(confidenceMap: Record<string, any>, key: string): number {
  const rawValue = confidenceMap?.[key];
  if (typeof rawValue === 'number') return rawValue;
  if (rawValue === 'high') return 95;
  if (rawValue === 'low') return 45;
  return 95;
}

function toDisplayDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function toISODate(display: string): string {
  const parts = display.split('-');
  if (parts.length !== 3) return display;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function isValidDisplayDate(dateStr: string): boolean {
  const regex = /^\d{2}-\d{2}-\d{4}$/;
  if (!regex.test(dateStr)) return false;
  const [day, month, year] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

// ---------- Component ----------
const Confirm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [exam, setExam] = useState<Record<string, any> | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [confidenceMap, setConfidenceMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'shared' | 'unavailable'>('idle');

  useEffect(() => {
    if (!id) return;
    const fetchExam = async () => {
      try {
        const snap = await getDoc(doc(db, 'exams', id));
        if (!snap.exists()) {
          setError('Exam not found.');
          setLoading(false);
          return;
        }
        const data = snap.data();
        setExam(data);
        const derived = deriveFieldData(data);
        derived.exam_date = toDisplayDate(derived.exam_date);
        setValues(derived);
        setConfidenceMap(getConfidenceMap(data));
      } catch (err: any) {
        setError(err.message || 'Failed to load exam details.');
      } finally {
        setLoading(false);
      }
    };
    fetchExam();
  }, [id]);

  const handleFieldChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  const getCurrentOrigin = (): Promise<string | null> => {
    const storedOrigin = localStorage.getItem(STORED_ORIGIN_KEY);
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      return Promise.resolve(storedOrigin);
    }

    setLocationStatus('requesting');
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coordinates = `${position.coords.latitude},${position.coords.longitude}`;
          localStorage.setItem(STORED_ORIGIN_KEY, coordinates);
          localStorage.setItem(STORED_LOCATION_PERMISSION_KEY, 'granted');
          setLocationStatus('shared');
          resolve(coordinates);
        },
        (error) => {
          // The backend receives null and deliberately uses the free time-buffer
          // estimate, so declining location permission never blocks confirmation.
          setLocationStatus('unavailable');
          if (error.code === error.PERMISSION_DENIED) {
            localStorage.removeItem(STORED_ORIGIN_KEY);
            localStorage.setItem(STORED_LOCATION_PERMISSION_KEY, 'denied');
            resolve(null);
            return;
          }
          resolve(storedOrigin);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    });
  };

  const requestLocation = () => {
    void getCurrentOrigin();
  };

  const handleSubmit = async () => {
    if (!id) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    if (values.exam_date && !isValidDisplayDate(values.exam_date)) {
      setError('Exam date must be in DD-MM-YYYY format.');
      return;
    }

    setError('');

    try {
      // Always request the freshest permitted position immediately before the
      // confirmation request. A rejection resolves to null rather than
      // blocking the user; the backend then uses its simple time-buffer plan.
      const confirmationOrigin = await getCurrentOrigin();
      setSubmitting(true);

      // Split the comma-separated list fields back into arrays and use the
      // field names the rest of the app actually reads (extracted_instructions),
      // so the corrected values land on the top-level document fields.
      const toList = (value: string) =>
        (value || '').split(',').map(s => s.trim()).filter(Boolean);

      const { instructions, required_documents, ...scalarValues } = values;
      const editedFields: Record<string, unknown> = {
        userId: currentUser.uid,
        ...scalarValues,
        exam_date: values.exam_date ? toISODate(values.exam_date) : '',
        required_documents: toList(required_documents),
        extracted_instructions: toList(instructions),
        // Coordinates are accepted by Google Directions as an origin string.
        // null means the backend should use its free reporting-time fallback.
        origin: confirmationOrigin,
        location_permission: confirmationOrigin ? 'granted' : 'denied',
        location_shared: Boolean(confirmationOrigin),
      };

      // confirmExam() wraps edited fields in { corrected_fields } as expected by the backend.
      await confirmExam(id, editedFields);

      // ✅ Navigate to Success – it will fetch the latest document itself
      navigate(`/success/${id}`);
    } catch (err: any) {
      setError(err.message || 'Unable to create your plan right now.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Loading / Error states (unchanged) ---
  if (loading) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-accent/30 border-t-accent rounded-full" />
      </div>
    );
  }

  if (error && !exam) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center px-4">
        <div className="glass p-8 text-center">
          <p className="text-danger mb-4">{error}</p>
          <button onClick={() => navigate('/upload')} className="btn-primary">Try Again</button>
        </div>
      </div>
    );
  }

  if (!exam) return null;

  const lowConfidenceCount = fieldConfig.filter(
    ({ key }) => getConfidenceValue(confidenceMap, key) <= 90
  ).length;
  const allLowConfidence = lowConfidenceCount === fieldConfig.length;

  return (
    <div className="min-h-screen w-full flex justify-center bg-app-gradient relative">
      <div className="w-full max-w-sm px-5 pt-8 pb-32">
        <h1 className="font-display font-semibold text-xl text-text-primary leading-snug">
          We've found your exam details.
        </h1>
        <p className="text-muted text-sm mt-1.5 leading-relaxed">
          Please verify — especially the <span className="text-accent font-medium">amber</span> ones.
        </p>

        {allLowConfidence && (
          <div className="mt-5 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 flex items-start gap-3 animate-fadeInUp">
            <AlertTriangle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <p className="text-sm text-accent leading-relaxed">
              We had trouble reading this document clearly. Please double-check every field below.
            </p>
          </div>
        )}

        <section className="mt-5 rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <div className="flex gap-3">
            <MapPin className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Plan your journey</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Allow Examora to know your location so we can tell you exactly when to leave.
              </p>
              {locationStatus === 'shared' ? (
                <p className="mt-2 text-xs text-success">Location shared for this travel estimate.</p>
              ) : locationStatus === 'unavailable' ? (
                <p className="mt-2 text-xs text-muted">
                  Location unavailable. We’ll use a reporting-time buffer instead.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={requestLocation}
                  disabled={locationStatus === 'requesting'}
                  className="mt-3 text-sm font-medium text-accent disabled:opacity-60"
                >
                  {locationStatus === 'requesting' ? 'Requesting location…' : 'Share my location'}
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="mt-6 space-y-3">
          {fieldConfig.map(({ key, label }, i) => {
            const confidence = getConfidenceValue(confidenceMap, key);
            const isLow = confidence <= 90;
            return (
              <div
                key={key}
                className={`card !p-4 border-l-4 animate-fadeInUp ${
                  isLow ? 'border-l-accent' : 'border-l-success'
                }`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted uppercase tracking-wide">
                    {label}
                  </label>
                  {isLow && (
                    <span className="text-accent text-xs flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Check this
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={values[key] || ''}
                  onChange={e => handleFieldChange(key, e.target.value)}
                  className="w-full bg-white/90 text-gray-900 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/60"
                  placeholder={key === 'exam_date' ? 'DD-MM-YYYY' : undefined}
                />
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setShowRaw(s => !s)}
          className="w-full mt-5 text-sm text-muted hover:text-text-primary transition-colors flex items-center justify-center gap-2"
        >
          {showRaw ? 'Hide' : 'View'} raw OCR text
          <ChevronDown className={`w-4 h-4 transition-transform ${showRaw ? 'rotate-180' : ''}`} />
        </button>

        {showRaw && (
          <pre className="mt-3 card !p-4 text-xs text-muted whitespace-pre-wrap font-body leading-relaxed animate-fadeInUp">
            {exam?.raw_ocr_text || 'No OCR text available.'}
          </pre>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] z-40">
        <div className="w-full max-w-sm glass !rounded-3xl p-4">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary w-full"
          >
            {submitting ? 'Setting things up…' : 'Looks good, create plan'}
          </button>
          {error && <p className="text-danger text-sm mt-2 text-center">{error}</p>}
        </div>
      </div>

      {submitting && (
        <div className="fixed inset-0 z-50 bg-bg/90 backdrop-blur-md flex flex-col items-center justify-center px-8 animate-fadeInUp">
          <div className="h-10 w-10 rounded-full border-2 border-stroke/30 border-t-accent animate-spin mb-6" />
          <p className="text-text-primary font-display font-medium text-center">
            Setting up your calendar, reminders, and maps…
          </p>
        </div>
      )}
    </div>
  );
};

export default Confirm;
