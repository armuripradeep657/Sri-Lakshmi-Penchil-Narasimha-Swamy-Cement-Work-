import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AtSign,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
  Send,
  ShieldCheck,
  Trash2,
  User,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBillingData } from '../context/BillingDataContext';
import { firebaseProjectId, formatTimestamp } from '../lib/firebase';
import {
  compressProfilePhoto,
  isValidFourDigitMpin,
  isValidSecretPassword,
  isValidUsername,
  normalizeUsername,
} from '../lib/mpinCrypto';
import { formatAppDate, tr } from '../lib/i18n';

export const ProfilePage: React.FC = () => {
  const {
    activeUid,
    userAccount,
    isAdmin,
    language,
    emailPasswordDisabled,
    updateMyProfile,
    changeMyEmail,
    setupMyUsernamePassword,
    setupMyMpin,
    disableMyMpin,
    lockWithMpin,
  } = useAuth();
  const { approvalRequests, submitProfileUpdateRequest } = useBillingData();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [displayName, setDisplayName] = useState(userAccount?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(userAccount?.phoneNumber || '');
  const [photoDataUrl, setPhotoDataUrl] = useState(userAccount?.photoDataUrl || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [username, setUsername] = useState(
    userAccount?.username || (isAdmin ? 'pradeep' : '')
  );
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsNotice, setCredsNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [requestedUsername, setRequestedUsername] = useState(userAccount?.username || '');
  const [newEmail, setNewEmail] = useState(userAccount?.email || '');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [mpin, setMpin] = useState('');
  const [confirmMpin, setConfirmMpin] = useState('');
  const [savingMpin, setSavingMpin] = useState(false);
  const [mpinNotice, setMpinNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const myProfileRequests = approvalRequests.filter(
    (r) => r.requesterUid === activeUid && r.requestType === 'profile_update'
  );
  const pendingProfileRequest = myProfileRequests.find((r) => r.status === 'pending') || null;
  const latestReviewedProfileRequest =
    myProfileRequests.find((r) => r.status === 'approved' || r.status === 'rejected') || null;

  useEffect(() => {
    if (!userAccount) return;
    setDisplayName(userAccount.displayName || '');
    setPhoneNumber(userAccount.phoneNumber || '');
    setPhotoDataUrl(userAccount.photoDataUrl || '');
    setNewEmail(userAccount.email || '');
    setRequestedUsername(userAccount.username || '');
    if (userAccount.username) {
      setUsername(userAccount.username);
    } else if (isAdmin) {
      setUsername((prev) => prev || 'pradeep');
    } else {
      setUsername('');
    }
  }, [userAccount, isAdmin]);

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProfileNotice(null);
    try {
      const compressed = await compressProfilePhoto(file);
      setPhotoDataUrl(compressed);
      setProfileNotice({
        type: 'ok',
        text: isAdmin
          ? tr(
              language,
              'Photo ready. Tap "Save Profile Details" to sync to cloud.',
              'ఫోటో సిద్ధంగా ఉంది. క్లౌడ్‌లో సింక్ చేయడానికి "ప్రొఫైల్ వివరాలు సేవ్ చేయండి" నొక్కండి.'
            )
          : tr(
              language,
              'Photo ready. Tap "Submit Changes for Owner Approval" to send for review.',
              'ఫోటో సిద్ధంగా ఉంది. ఆమోదం కోసం పంపడానికి "యజమాని ఆమోదానికి పంపండి" నొక్కండి.'
            ),
      });
    } catch (err) {
      setProfileNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Unable to process photo.', 'ఫోటోను ప్రాసెస్ చేయడం సాధ్యం కాలేదు.'),
      });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileNotice(null);
    try {
      if (isAdmin) {
        await updateMyProfile({
          displayName,
          phoneNumber,
          photoDataUrl,
        });
        setProfileNotice({
          type: 'ok',
          text: tr(language, 'Profile & photo saved to database.', 'ప్రొఫైల్ & ఫోటో డేటాబేస్‌లో సేవ్ చేయబడింది.'),
        });
      } else {
        await submitProfileUpdateRequest({
          displayName,
          phoneNumber,
          photoDataUrl,
        });
        setProfileNotice({
          type: 'ok',
          text: tr(
            language,
            'Profile update request sent to Owner for approval. Your profile will update automatically once approved.',
            'ప్రొఫైల్ మార్పు అభ్యర్థన యజమాని ఆమోదం కోసం పంపబడింది. ఆమోదించిన వెంటనే మీ ప్రొఫైల్ అప్‌డేట్ అవుతుంది.'
          ),
        });
      }
    } catch (err) {
      setProfileNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Failed to save profile.', 'ప్రొఫైల్ సేవ్ చేయడం విఫలమైంది.'),
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveUsernamePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredsNotice(null);
    if (!isAdmin && !userAccount?.username) {
      setCredsNotice({
        type: 'err',
        text: tr(
          language,
          'Your username is not set yet. Request a username in the section below and wait for Owner approval first.',
          'మీ యూజర్ పేరు ఇంకా సెట్ కాలేదు. ముందుగా కింద యూజర్ పేరు మార్పు అభ్యర్థన పంపి యజమాని ఆమోదం పొందండి.'
        ),
      });
      return;
    }
    const cleanU = normalizeUsername(isAdmin ? username : userAccount?.username || '');
    if (!isValidUsername(cleanU)) {
      setCredsNotice({
        type: 'err',
        text: tr(
          language,
          'Username must be 3-40 characters using lowercase letters, numbers, dot (.), underscore (_), or hyphen (-).',
          'యూజర్ పేరు 3-40 అక్షరాలు (చిన్న అక్షరాలు, సంఖ్యలు, ., _, -) లోపల ఉండాలి.'
        ),
      });
      return;
    }
    if (!isValidSecretPassword(newPassword)) {
      setCredsNotice({
        type: 'err',
        text: tr(language, 'Password must be at least 4 characters.', 'పాస్‌వర్డ్ కనీసం 4 అక్షరాలు ఉండాలి.'),
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setCredsNotice({
        type: 'err',
        text: tr(language, 'Password and Confirm Password do not match.', 'పాస్‌వర్డ్ మరియు నిర్ధారణ పాస్‌వర్డ్ సరిపోలలేదు.'),
      });
      return;
    }
    setSavingCreds(true);
    try {
      await setupMyUsernamePassword(cleanU, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setCredsNotice({
        type: 'ok',
        text: isAdmin
          ? tr(
              language,
              `Username "@${cleanU}" and password saved! You can now sign in from any device (and offline once synced) without losing any data.`,
              `యూజర్ పేరు "@${cleanU}" మరియు పాస్‌వర్డ్ సేవ్ అయ్యాయి! ఇప్పుడు ఏ పరికరం నుండైనా డేటా కోల్పోకుండా లాగిన్ కావచ్చు.`
            )
          : tr(
              language,
              `Password updated for "@${cleanU}"!`,
              `"@${cleanU}" కోసం పాస్‌వర్డ్ నవీకరించబడింది!`
            ),
      });
    } catch (err) {
      setCredsNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Failed to save username & password.', 'యూజర్ పేరు & పాస్‌వర్డ్ సేవ్ చేయడం విఫలమైంది.'),
      });
    } finally {
      setSavingCreds(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmail(true);
    setEmailNotice(null);
    try {
      if (isAdmin) {
        await changeMyEmail(newEmail);
        setEmailNotice({
          type: 'ok',
          text: tr(
            language,
            'Email updated & authorized. You can now sign in with this new Google email too.',
            'ఇమెయిల్ నవీకరించబడింది & అనుమతించబడింది. మీరు ఇప్పుడు ఈ కొత్త గూగుల్ ఇమెయిల్‌తో కూడా లాగిన్ కావచ్చు.'
          ),
        });
      } else {
        if (!userAccount) return;
        await submitProfileUpdateRequest({
          displayName: userAccount.displayName,
          phoneNumber: userAccount.phoneNumber,
          photoDataUrl: userAccount.photoDataUrl,
          username: requestedUsername,
          email: newEmail,
        });
        setEmailNotice({
          type: 'ok',
          text: tr(
            language,
            'Username / Email update request sent to Owner for approval. Your login details will update once approved.',
            'యూజర్ పేరు / ఇమెయిల్ మార్పు అభ్యర్థన యజమాని ఆమోదానికి పంపబడింది. ఆమోదించిన తర్వాత మారుతుంది.'
          ),
        });
      }
    } catch (err) {
      setEmailNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Failed to update email.', 'ఇమెయిల్ నవీకరించడం విఫలమైంది.'),
      });
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSetupMpin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMpinNotice(null);
    if (!isValidFourDigitMpin(mpin)) {
      setMpinNotice({
        type: 'err',
        text: tr(language, 'Enter exactly 4 numeric digits (0-9).', 'సరిగ్గా 4 అంకెలు (0-9) నమోదు చేయండి.'),
      });
      return;
    }
    if (mpin !== confirmMpin) {
      setMpinNotice({
        type: 'err',
        text: tr(language, 'MPIN and Confirm MPIN do not match.', 'ఎంపిన్ మరియు నిర్ధారణ ఎంపిన్ సరిపోలలేదు.'),
      });
      return;
    }
    setSavingMpin(true);
    try {
      await setupMyMpin(mpin);
      setMpin('');
      setConfirmMpin('');
      setMpinNotice({
        type: 'ok',
        text: tr(
          language,
          '4-digit fast MPIN saved! You can now unlock offline or online using your 4-digit MPIN.',
          '4-అంకెల ఫాస్ట్ ఎంపిన్ సేవ్ అయింది! ఇప్పుడు ఆఫ్‌లైన్ లేదా ఆన్‌లైన్‌లో ఎంపిన్‌తో త్వరగా అన్‌లాక్ చేయవచ్చు.'
        ),
      });
    } catch (err) {
      setMpinNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Failed to create 4-digit MPIN.', '4-అంకెల ఎంపిన్ సృష్టించడం విఫలమైంది.'),
      });
    } finally {
      setSavingMpin(false);
    }
  };

  const handleDisableMpin = async () => {
    setSavingMpin(true);
    setMpinNotice(null);
    try {
      await disableMyMpin();
      setMpinNotice({
        type: 'ok',
        text: tr(language, '4-digit MPIN disabled for your account.', 'మీ ఖాతాకు 4-అంకెల ఎంపిన్ నిలిపివేయబడింది.'),
      });
    } catch (err) {
      setMpinNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : tr(language, 'Failed to disable MPIN.', 'ఎంపిన్ నిలిపివేయడం విఫలమైంది.'),
      });
    } finally {
      setSavingMpin(false);
    }
  };

  if (!userAccount) return null;

  const formatRequestChanges = (req: typeof pendingProfileRequest) => {
    if (!req) return [];
    const list: string[] = [];
    if (req.proposedDisplayName !== undefined) {
      list.push(
        tr(
          language,
          `Name: ${req.currentDisplayName || '—'} → ${req.proposedDisplayName}`,
          `పేరు: ${req.currentDisplayName || '—'} → ${req.proposedDisplayName}`
        )
      );
    }
    if (req.proposedPhoneNumber !== undefined) {
      list.push(
        tr(
          language,
          `Phone: ${req.currentPhoneNumber || '—'} → ${req.proposedPhoneNumber || '—'}`,
          `ఫోన్: ${req.currentPhoneNumber || '—'} → ${req.proposedPhoneNumber || '—'}`
        )
      );
    }
    if (req.proposedUsername !== undefined) {
      list.push(
        tr(
          language,
          `Username: ${req.currentUsername ? '@' + req.currentUsername : '—'} → @${req.proposedUsername}`,
          `యూజర్ పేరు: ${req.currentUsername ? '@' + req.currentUsername : '—'} → @${req.proposedUsername}`
        )
      );
    }
    if (req.proposedEmail !== undefined) {
      list.push(
        tr(
          language,
          `Email: ${req.currentEmail || '—'} → ${req.proposedEmail}`,
          `ఇమెయిల్: ${req.currentEmail || '—'} → ${req.proposedEmail}`
        )
      );
    }
    if (req.proposedPhotoDataUrl !== undefined) {
      list.push(tr(language, 'Profile Photo Updated', 'ప్రొఫైల్ ఫోటో మార్పు'));
    }
    return list;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-slp-in">
      {/* Identity Overview Banner */}
      <div className="bg-[#0A2240] text-white rounded-2xl p-5 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {photoDataUrl ? (
            <img
              src={photoDataUrl}
              alt={userAccount.displayName}
              className="w-16 h-16 rounded-full object-cover border-2 border-cyan-300 shadow shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center shrink-0">
              <User className="w-7 h-7 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold truncate">{userAccount.displayName}</h2>
              <span className="px-2 py-0.5 rounded-md bg-white/15 text-[10px] font-bold uppercase tracking-wide">
                {isAdmin ? tr(language, 'Owner / Admin', 'యజమాని / అడ్మిన్') : tr(language, 'Staff', 'సిబ్బంది')}
              </span>
              {userAccount.username && (
                <span className="px-2 py-0.5 rounded-md bg-cyan-400/20 border border-cyan-300/40 text-cyan-100 text-[10px] font-mono font-bold">
                  @{userAccount.username}
                </span>
              )}
            </div>
            <div className="text-xs text-[#E5DDD3] mt-1 flex items-center gap-1.5 truncate">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{userAccount.email}</span>
            </div>
            <div className="text-xs text-[#F3EDE5] mt-0.5 flex items-center gap-1.5 font-mono">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span>{userAccount.phoneNumber || tr(language, 'Phone not added yet', 'ఫోన్ ఇంకా జోడించలేదు')}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {userAccount.mpinEnabled && (
            <button
              type="button"
              onClick={lockWithMpin}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-[#0A2240] text-xs font-bold shadow hover:bg-[#F6F1EA] transition"
            >
              <Lock className="w-3.5 h-3.5 text-[#9A4307]" />
              {tr(language, 'Lock App', 'యాప్ లాక్ చేయి')}
            </button>
          )}
        </div>
      </div>

      {/* Staff Approval Request Status Card */}
      {!isAdmin && (pendingProfileRequest || latestReviewedProfileRequest) && (
        <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-sm space-y-3">
          {pendingProfileRequest && (
            <div className="rounded-xl bg-[#FDF3DF] border border-[#F0D9B5] p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#9A4307]">
                  <Clock className="w-4 h-4 shrink-0" />
                  {tr(language, 'Pending Owner Approval', 'యజమాని ఆమోదం కోసం వేచి ఉంది')}
                </span>
                <span className="text-[11px] font-mono text-[#7C3405]">
                  {formatAppDate(formatTimestamp(pendingProfileRequest.createdAt), language, true)}
                </span>
              </div>
              <p className="text-xs text-[#7C3405]">
                {tr(
                  language,
                  'Your requested profile changes are waiting for the Owner to approve:',
                  'మీరు అభ్యర్థించిన ప్రొఫైల్ మార్పులు యజమాని ఆమోదం కోసం వేచి ఉన్నాయి:'
                )}
              </p>
              <ul className="text-xs text-[#0A2240] font-medium space-y-1 list-disc list-inside">
                {formatRequestChanges(pendingProfileRequest).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {latestReviewedProfileRequest && !pendingProfileRequest && (
            <div
              className={`rounded-xl border p-3 text-xs flex items-start gap-2.5 ${
                latestReviewedProfileRequest.status === 'approved'
                  ? 'bg-[#E7F6EC] border-[#C5E8D1] text-[#15803D]'
                  : 'bg-[#FCE8E6] border-[#F5C6C0] text-[#C23B2B]'
              }`}
            >
              {latestReviewedProfileRequest.status === 'approved' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <div className="font-bold">
                  {latestReviewedProfileRequest.status === 'approved'
                    ? tr(language, 'Last Profile Update Approved', 'చివరి ప్రొఫైల్ మార్పు ఆమోదించబడింది')
                    : tr(language, 'Last Profile Update Declined', 'చివరి ప్రొఫైల్ మార్పు తిరస్కరించబడింది')}
                </div>
                <div className="text-[11px] mt-0.5 opacity-90">
                  {tr(language, 'Reviewed by', 'సమీక్షించినవారు:')} {latestReviewedProfileRequest.reviewedByName || tr(language, 'Owner', 'యజమాని')} ·{' '}
                  {formatAppDate(formatTimestamp(latestReviewedProfileRequest.reviewedAt), language, true)}
                  {latestReviewedProfileRequest.decisionNote ? ` · ${latestReviewedProfileRequest.decisionNote}` : ''}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Username & Password Login Anywhere */}
      <form
        onSubmit={handleSaveUsernamePassword}
        className="bg-white border border-[#E5DDD3] rounded-2xl p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#0A2240] flex items-center gap-2">
              <AtSign className="w-4 h-4 text-[#9A4307]" />{' '}
              {isAdmin
                ? tr(language, 'Username & Password Login (Any Device & Offline)', 'యూజర్ పేరు & పాస్‌వర్డ్ లాగిన్ (ఏ పరికరమైనా & ఆఫ్‌లైన్)')
                : tr(language, 'Password Login (Any Device & Offline)', 'పాస్‌వర్డ్ లాగిన్ (ఏ పరికరమైనా & ఆఫ్‌లైన్)')}
            </h3>
            <p className="text-xs text-[#6D665E] mt-0.5">
              {isAdmin
                ? tr(
                    language,
                    'Set a unique username and password to sign into this same account from any phone or computer without losing any bills, products, or data.',
                    'బిల్లులు, ఉత్పత్తులు లేదా డేటా కోల్పోకుండా ఏ ఫోన్ లేదా కంప్యూటర్ నుండైనా ఇదే ఖాతాలో లాగిన్ కావడానికి యూజర్ పేరు మరియు పాస్‌వర్డ్ సెట్ చేయండి.'
                  )
                : tr(
                    language,
                    'Update your account password anytime. Changing your username requires Owner approval in the section below.',
                    'మీ ఖాతా పాస్‌వర్డ్‌ను ఎప్పుడైనా నవీకరించుకోవచ్చు. యూజర్ పేరు మార్చాలంటే క్రింద యజమాని ఆమోదం కోసం అభ్యర్థించాలి.'
                  )}
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 ${
              userAccount.passwordEnabled && userAccount.username
                ? 'bg-[#E7F6EC] text-[#15803D] border border-[#C5E8D1]'
                : 'bg-[#FDF3DF] text-[#9A4307] border border-[#F0D9B5]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {userAccount.username ? `@${userAccount.username}` : tr(language, 'Not Set', 'సెట్ కాలేదు')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-[#2D3138] mb-1">
              {tr(language, 'Username *', 'యూజర్ పేరు *')}
            </label>
            <input
              type="text"
              required={isAdmin}
              disabled={!isAdmin}
              value={username}
              onChange={(e) => setUsername(normalizeUsername(e.target.value))}
              placeholder={isAdmin ? 'pradeep' : tr(language, 'Requires Owner approval', 'యజమాని ఆమోదం అవసరం')}
              className={`w-full px-3 py-2.5 font-mono rounded-xl border border-[#E5DDD3] focus:outline-none ${
                isAdmin
                  ? 'bg-[#FAF8F5] focus:bg-white focus:ring-2 focus:ring-[#0A2240]'
                  : 'bg-[#F3EDE5] text-[#6D665E] cursor-not-allowed'
              }`}
            />
          </div>
          <div>
            <label className="block font-semibold text-[#2D3138] mb-1">
              {userAccount.passwordEnabled
                ? tr(language, 'New Password *', 'కొత్త పాస్‌వర్డ్ *')
                : tr(language, 'Create Password *', 'పాస్‌వర్డ్ సృష్టించండి *')}
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                required
                minLength={4}
                disabled={!isAdmin && !userAccount.username}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={tr(language, 'Min 4 characters', 'కనీసం 4 అక్షరాలు')}
                className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2240] disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8279] hover:text-[#2D3138]"
              >
                {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block font-semibold text-[#2D3138] mb-1">
              {tr(language, 'Confirm Password *', 'పాస్‌వర్డ్ నిర్ధారించండి *')}
            </label>
            <input
              type={showPwd ? 'text' : 'password'}
              required
              minLength={4}
              disabled={!isAdmin && !userAccount.username}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={tr(language, 'Re-enter password', 'పాస్‌వర్డ్ మళ్లీ నమోదు చేయండి')}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2240] disabled:opacity-60"
            />
          </div>
        </div>

        {!isAdmin && !userAccount.username && (
          <div className="p-2.5 rounded-xl bg-[#FDF3DF] border border-[#F0D9B5] text-xs text-[#9A4307] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {tr(
                language,
                'Request a username in the "Request Username / Email Change" card below first. Once Owner approves, you can set your password here.',
                'ముందుగా క్రింద ఉన్న "యూజర్ పేరు / ఇమెయిల్ మార్పు అభ్యర్థన" విభాగంలో యూజర్ పేరును అభ్యర్థించండి. యజమాని ఆమోదించిన తర్వాత ఇక్కడ పాస్‌వర్డ్ సెట్ చేయవచ్చు.'
              )}
            </span>
          </div>
        )}

        {credsNotice && (
          <div
            className={`p-3 rounded-xl text-xs font-medium space-y-2 ${
              credsNotice.type === 'ok'
                ? 'bg-[#E7F6EC] border border-[#C5E8D1] text-[#15803D]'
                : 'bg-[#FCE8E6] border border-[#F5C6C0] text-[#C23B2B]'
            }`}
          >
            <div>{credsNotice.text}</div>
            {emailPasswordDisabled && credsNotice.type === 'err' && (
              <a
                href={`https://console.firebase.google.com/project/${firebaseProjectId}/authentication/providers`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A2240] text-white text-[11px] font-semibold"
              >
                {tr(language, 'Enable Email/Password in Firebase Console', 'ఫైర్‌బేస్ కన్సోల్‌లో ఇమెయిల్/పాస్‌వర్డ్ ప్రారంభించండి')}{' '}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingCreds || (!isAdmin && !userAccount.username)}
            className="px-4 py-2.5 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white text-xs font-bold transition disabled:opacity-50"
          >
            {savingCreds
              ? tr(language, 'Securing Credentials...', 'వివరాలు భద్రపరుస్తోంది...')
              : !isAdmin
              ? tr(language, 'Update Password', 'పాస్‌వర్డ్ నవీకరించండి')
              : userAccount.passwordEnabled
              ? tr(language, 'Update Username & Password', 'యూజర్ పేరు & పాస్‌వర్డ్ నవీకరించండి')
              : tr(language, 'Save Username & Password', 'యూజర్ పేరు & పాస్‌వర్డ్ సేవ్ చేయండి')}
          </button>
        </div>
      </form>

      {/* Photo, Name & Phone Number */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white border border-[#E5DDD3] rounded-2xl p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#0A2240] flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#9A4307]" />{' '}
              {tr(language, 'Profile Photo, Name & Phone Number', 'ప్రొఫైల్ ఫోటో, పేరు & ఫోన్ నంబర్')}
            </h3>
            <p className="text-xs text-[#6D665E] mt-0.5">
              {isAdmin
                ? tr(
                    language,
                    'Visible on your portal, billing records, and quick login screen.',
                    'మీ పోర్టల్, బిల్లింగ్ రికార్డులు మరియు త్వరిత లాగిన్ స్క్రీన్‌లో కనిపిస్తుంది.'
                  )
                : tr(
                    language,
                    'Any changes here are sent to the Owner for approval and applied automatically once approved.',
                    'ఇక్కడ చేసే మార్పులు యజమాని ఆమోదానికి పంపబడతాయి. ఆమోదించిన తర్వాత మీ ప్రొఫైల్ మారుతుంది.'
                  )}
            </p>
          </div>
          {!isAdmin && (
            <span className="px-2.5 py-1 rounded-lg bg-[#FDF3DF] border border-[#F0D9B5] text-[#9A4307] text-[10px] font-bold shrink-0">
              {tr(language, 'Requires Owner Approval', 'యజమాని ఆమోదం అవసరం')}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            {photoDataUrl ? (
              <img
                src={photoDataUrl}
                alt={tr(language, 'Profile Preview', 'ప్రొఫైల్ ప్రివ్యూ')}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-[#DFD7CC] shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-[#F6F1EA] border-2 border-dashed border-[#DFD7CC] flex items-center justify-center text-[#9A4307]">
                <User className="w-8 h-8" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoPick}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A2240] text-white text-xs font-semibold hover:bg-[#13325B] transition"
              >
                <Camera className="w-3.5 h-3.5" />
                {photoDataUrl ? tr(language, 'Change Photo', 'ఫోటో మార్చు') : tr(language, 'Upload Photo', 'ఫోటో అప్‌లోడ్ చేయి')}
              </button>
              {photoDataUrl && (
                <button
                  type="button"
                  onClick={() => setPhotoDataUrl('')}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-[#F5C6C0] text-[#C23B2B] text-xs font-semibold hover:bg-[#FCE8E6] transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {tr(language, 'Remove', 'తొలగించు')}
                </button>
              )}
            </div>
            <p className="text-[11px] text-[#6D665E]">
              {tr(language, 'Automatically compressed & synced across devices.', 'ఆటోమేటిక్‌గా కంప్రెస్ అయి అన్ని పరికరాలకు సింక్ అవుతుంది.')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-[#2D3138] mb-1">
              {tr(language, 'Full Name *', 'పూర్తి పేరు *')}
            </label>
            <input
              required
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={tr(language, 'Enter full name', 'పూర్తి పేరు నమోదు చేయండి')}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
            />
          </div>
          <div>
            <label className="block font-semibold text-[#2D3138] mb-1">
              {tr(language, 'Phone Number', 'ఫోన్ నంబర్')}
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder={tr(language, 'e.g. 9876543210', 'ఉదా. 9876543210')}
              className="w-full px-3 py-2.5 font-mono rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
            />
          </div>
        </div>

        {profileNotice && (
          <div
            className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
              profileNotice.type === 'ok'
                ? 'bg-[#E7F6EC] border border-[#C5E8D1] text-[#15803D]'
                : 'bg-[#FCE8E6] border border-[#F5C6C0] text-[#C23B2B]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{profileNotice.text}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile || (!isAdmin && Boolean(pendingProfileRequest))}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white text-xs font-bold transition disabled:opacity-50"
          >
            {!isAdmin && <Send className="w-3.5 h-3.5" />}
            {savingProfile
              ? tr(language, 'Submitting...', 'సమర్పిస్తోంది...')
              : isAdmin
              ? tr(language, 'Save Profile Details', 'ప్రొఫైల్ వివరాలు సేవ్ చేయండి')
              : pendingProfileRequest
              ? tr(language, 'Approval Pending...', 'ఆమోదం పెండింగ్‌లో ఉంది...')
              : tr(language, 'Submit Changes for Owner Approval', 'యజమాని ఆమోదానికి పంపండి')}
          </button>
        </div>
      </form>

      {/* Change Email / Request Username & Email Change */}
      <form
        onSubmit={handleChangeEmail}
        className="bg-white border border-[#E5DDD3] rounded-2xl p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#0A2240] flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#9A4307]" />{' '}
              {isAdmin
                ? tr(language, 'Change Google / Recovery Email Address', 'గూగుల్ / రికవరీ ఇమెయిల్ చిరునామా మార్చండి')
                : tr(language, 'Request Username / Recovery Email Change', 'యూజర్ పేరు / రికవరీ ఇమెయిల్ మార్పు అభ్యర్థన')}
            </h3>
            <p className="text-xs text-[#6D665E] mt-0.5">
              {isAdmin
                ? tr(
                    language,
                    'Updates your profile email and authorizes the new Google email to carry over your photo, phone, username, and MPIN.',
                    'మీ ప్రొఫైల్ ఇమెయిల్‌ను నవీకరిస్తుంది మరియు మీ ఫోటో, ఫోన్, యూజర్ పేరు, ఎంపిన్‌లను కొత్త గూగుల్ ఇమెయిల్‌కు వర్తింపజేస్తుంది.'
                  )
                : tr(
                    language,
                    'Submit a new username or Google/recovery email for Owner approval.',
                    'కొత్త యూజర్ పేరు లేదా గూగుల్/రికవరీ ఇమెయిల్ కోసం యజమాని ఆమోదాన్ని అభ్యర్థించండి.'
                  )}
            </p>
          </div>
          {!isAdmin && (
            <span className="px-2.5 py-1 rounded-lg bg-[#FDF3DF] border border-[#F0D9B5] text-[#9A4307] text-[10px] font-bold shrink-0">
              {tr(language, 'Requires Owner Approval', 'యజమాని ఆమోదం అవసరం')}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 text-xs">
          {!isAdmin && (
            <input
              type="text"
              value={requestedUsername}
              onChange={(e) => setRequestedUsername(normalizeUsername(e.target.value))}
              placeholder={tr(language, 'New username (e.g. staff.ravi)', 'కొత్త యూజర్ పేరు (ఉదా. staff.ravi)')}
              className="sm:w-52 px-3 py-2.5 font-mono rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
            />
          )}
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="newstaff@gmail.com"
            className="flex-1 px-3 py-2.5 font-mono rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
          />
          <button
            type="submit"
            disabled={savingEmail || (!isAdmin && Boolean(pendingProfileRequest))}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0A2240] hover:bg-[#13325B] text-white font-bold whitespace-nowrap transition disabled:opacity-50"
          >
            {!isAdmin && <Send className="w-3.5 h-3.5" />}
            {savingEmail
              ? tr(language, 'Submitting...', 'సమర్పిస్తోంది...')
              : isAdmin
              ? tr(language, 'Update Email', 'ఇమెయిల్ నవీకరించు')
              : pendingProfileRequest
              ? tr(language, 'Approval Pending...', 'ఆమోదం పెండింగ్...')
              : tr(language, 'Request Approval', 'ఆమోదం అభ్యర్థించండి')}
          </button>
        </div>

        {emailNotice && (
          <div
            className={`p-3 rounded-xl text-xs font-medium ${
              emailNotice.type === 'ok'
                ? 'bg-[#E7F6EC] border border-[#C5E8D1] text-[#15803D]'
                : 'bg-[#FCE8E6] border border-[#F5C6C0] text-[#C23B2B]'
            }`}
          >
            {emailNotice.text}
          </div>
        )}
      </form>

      {/* 4-Digit MPIN Fast Login Setup */}
      <form
        onSubmit={handleSetupMpin}
        className="bg-white border border-[#E5DDD3] rounded-2xl p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#0A2240] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#9A4307]" />{' '}
              {tr(language, '4-Digit Fast Login MPIN', '4-అంకెల ఫాస్ట్ లాగిన్ ఎంపిన్')}
            </h3>
            <p className="text-xs text-[#6D665E] mt-0.5">
              {tr(
                language,
                'Create a 4-digit numeric MPIN so you can unlock and sign in fast (even offline) using your MPIN.',
                'ఆఫ్‌లైన్ లేదా ఆన్‌లైన్‌లో త్వరగా అన్‌లాక్ చేయడానికి 4-అంకెల ఎంపిన్ సృష్టించండి.'
              )}
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 ${
              userAccount.mpinEnabled
                ? 'bg-[#E7F6EC] text-[#15803D] border border-[#C5E8D1]'
                : 'bg-[#FDF3DF] text-[#9A4307] border border-[#F0D9B5]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {userAccount.mpinEnabled
              ? tr(language, 'MPIN Active', 'ఎంపిన్ సక్రియం')
              : tr(language, 'Not Created', 'సెట్ కాలేదు')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-[#2D3138] mb-1">
              {userAccount.mpinEnabled
                ? tr(language, 'New 4-Digit MPIN *', 'కొత్త 4-అంకెల ఎంపిన్ *')
                : tr(language, 'Create 4-Digit MPIN *', '4-అంకెల ఎంపిన్ సృష్టించండి *')}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={mpin}
              onChange={(e) => setMpin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className="w-full px-3 py-2.5 font-mono tracking-[0.5em] text-center text-base rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
            />
          </div>
          <div>
            <label className="block font-semibold text-[#2D3138] mb-1">
              {tr(language, 'Confirm 4-Digit MPIN *', '4-అంకెల ఎంపిన్ నిర్ధారించండి *')}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmMpin}
              onChange={(e) => setConfirmMpin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className="w-full px-3 py-2.5 font-mono tracking-[0.5em] text-center text-base rounded-xl border border-[#E5DDD3] bg-[#FAF8F5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A2240]"
            />
          </div>
        </div>

        {mpinNotice && (
          <div
            className={`p-3 rounded-xl text-xs font-medium ${
              mpinNotice.type === 'ok'
                ? 'bg-[#E7F6EC] border border-[#C5E8D1] text-[#15803D]'
                : 'bg-[#FCE8E6] border border-[#F5C6C0] text-[#C23B2B]'
            }`}
          >
            {mpinNotice.text}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {userAccount.mpinEnabled ? (
            <button
              type="button"
              onClick={handleDisableMpin}
              disabled={savingMpin}
              className="px-3.5 py-2 rounded-xl border border-[#F5C6C0] text-[#C23B2B] text-xs font-semibold hover:bg-[#FCE8E6] transition"
            >
              {tr(language, 'Disable MPIN', 'ఎంపిన్ నిలిపివేయి')}
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={savingMpin || mpin.length !== 4 || confirmMpin.length !== 4}
            className="px-4 py-2.5 rounded-xl bg-[#0A2240] hover:bg-[#0A2240] text-white text-xs font-bold transition disabled:opacity-50"
          >
            {savingMpin
              ? tr(language, 'Encrypting MPIN...', 'ఎంపిన్ ఎన్‌క్రిప్ట్ అవుతోంది...')
              : userAccount.mpinEnabled
              ? tr(language, 'Update 4-Digit MPIN', '4-అంకెల ఎంపిన్ నవీకరించు')
              : tr(language, 'Create 4-Digit MPIN', '4-అంకెల ఎంపిన్ సృష్టించు')}
          </button>
        </div>
      </form>
    </div>
  );
};
