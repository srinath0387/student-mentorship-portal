import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  Upload,
  X,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../lib/api';

interface ProfilePhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: 'student' | 'faculty' | string;
  userId: string; // roll_number for students, email for faculty
  userName?: string;
  currentPhotoUrl?: string;
  isEnforced?: boolean; // If true, triggered on login because photo is missing
  onSuccess?: (photoUrl: string) => void;
}

/**
 * Resizes and compresses an image file into a square avatar data URL (500x500 JPEG)
 * to keep payload small, crisp, and performant.
 */
function compressImage(file: File, maxDim = 500, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Crop to square from center
        const size = Math.min(width, height);
        const startX = (width - size) / 2;
        const startY = (height - size) / 2;

        canvas.width = maxDim;
        canvas.height = maxDim;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to initialize canvas'));
          return;
        }

        ctx.drawImage(img, startX, startY, size, size, 0, 0, maxDim, maxDim);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Failed to load image file'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const ProfilePhotoUploadModal: React.FC<ProfilePhotoUploadModalProps> = ({
  isOpen,
  onClose,
  role,
  userId,
  userName = 'User',
  currentPhotoUrl,
  isEnforced = false,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPG, PNG, or WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image file is too large. Maximum allowed size is 5MB.');
      return;
    }

    setError(null);
    setSelectedFile(file);
    setIsProcessing(true);

    try {
      const compressedDataUrl = await compressImage(file, 500, 0.88);
      setPreviewUrl(compressedDataUrl);
    } catch (err: any) {
      setError(err.message || 'Error processing image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!previewUrl || !userId) {
      setError('Please choose a photo before saving.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (role === 'student') {
        // Save to student record
        await api.updateStudentProfile(userId, {
          photo_url: previewUrl,
        } as any);
        queryClient.invalidateQueries({ queryKey: ['studentProfile', userId] });
        queryClient.invalidateQueries({ queryKey: ['myStudentProfile'] });
        queryClient.invalidateQueries({ queryKey: ['student'] });
      } else {
        // Save to faculty full profile
        const email = userId.toLowerCase().trim();
        let existingProfile: any = {};
        try {
          existingProfile = await api.getFacultyFullProfile(email);
        } catch {
          existingProfile = {};
        }

        const updatedProfile = {
          ...existingProfile,
          personal: {
            ...(existingProfile?.personal || {}),
            photo_url: previewUrl,
          },
        };

        await api.updateFacultyFullProfile(email, updatedProfile);
        queryClient.invalidateQueries({ queryKey: ['facultyFullProfile', email] });
        queryClient.invalidateQueries({ queryKey: ['myFacultyFullProfile'] });
        queryClient.invalidateQueries({ queryKey: ['faculty'] });
      }

      setIsSuccess(true);
      if (onSuccess) onSuccess(previewUrl);

      setTimeout(() => {
        setIsSuccess(false);
        setPreviewUrl(null);
        setSelectedFile(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to save profile photo. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const initials = userName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U';

  const activeDisplay = previewUrl || currentPhotoUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-surface border border-borderLine rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-borderLine bg-surface-2 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand-primary flex items-center justify-center font-bold">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-textPrimary">
                {isEnforced ? 'Profile Photo Required' : 'Update Profile Photo'}
              </h2>
              <p className="text-[11px] text-textSecondary">
                {isEnforced
                  ? 'Please upload your institutional photo to continue'
                  : 'Upload a passport-style portrait photograph'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-surface border border-transparent hover:border-borderLine transition-colors"
            title="Dismiss for now"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Instructions notice */}
          {isEnforced && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-bold">Photo Verification Pending</p>
                <p className="text-[11px] mt-0.5 text-amber-700 dark:text-amber-400/90 leading-tight">
                  Institutional guidelines require every {role === 'student' ? 'student' : 'faculty member'} to upload their profile photo for digital attendance, hall tickets, and mentorship verification.
                </p>
              </div>
            </div>
          )}

          {/* Photo Avatar Preview Area */}
          <div className="flex flex-col items-center justify-center space-y-3 pt-2">
            <div className="relative group">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-surface ring-4 ring-brand-primary/20 shadow-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
                {activeDisplay ? (
                  <img
                    src={activeDisplay}
                    alt={userName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-4xl font-black">{initials}</span>
                )}
              </div>

              {/* Upload trigger overlay button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSaving || isProcessing}
                className="absolute inset-0 rounded-full bg-black/40 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-xs cursor-pointer"
              >
                <Camera className="w-6 h-6 mb-1" />
                <span className="text-[10px] font-bold">Change Photo</span>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSaving || isProcessing}
              className="text-xs font-bold text-brand-primary hover:underline inline-flex items-center gap-1.5 pt-1"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing Image...</span>
                </>
              ) : previewUrl ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Choose Another Image</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose Photo from Device</span>
                </>
              )}
            </button>
            <p className="text-[11px] text-textMuted text-center max-w-xs">
              Supports JPG, PNG, or WebP. Centered passport-style portraits recommended.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Message */}
          {isSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="font-bold">Profile photo uploaded successfully!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-borderLine bg-surface-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="text-xs font-semibold px-3 py-2 rounded-xl text-textSecondary hover:text-textPrimary hover:bg-surface border border-transparent hover:border-borderLine transition-colors"
          >
            {isEnforced ? 'Remind Me Next Time' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!previewUrl || isSaving || isProcessing || isSuccess}
            className={`text-xs font-bold px-4 py-2 rounded-xl text-white transition-all shadow-sm flex items-center gap-1.5 ${
              !previewUrl || isSaving || isProcessing || isSuccess
                ? 'bg-brand-primary/50 cursor-not-allowed'
                : 'bg-brand-primary hover:bg-brand-primary/90'
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving Photo...</span>
              </>
            ) : isSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Upload & Save Photo</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
