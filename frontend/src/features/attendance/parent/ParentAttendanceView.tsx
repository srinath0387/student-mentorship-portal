import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { StudentAttendanceView } from '../student/StudentAttendanceView';
import { MeetingLogsView } from '../../../components/MeetingLogsView';
import { api } from '../../../lib/api';
import { Bell } from 'lucide-react';

export const ParentAttendanceView: React.FC = () => {
  const { user } = useAuth();
  // Parent's ward roll number is stored in their profile
  const wardRollNumber = (user as any)?.wardRollNumber || (user as any)?.rollNumber || '';

  const { data: meetingLogs = [], isLoading: meetingsLoading } = useQuery<any[]>({
    queryKey: ['parentWardMeetings', wardRollNumber],
    queryFn: () => api.getMentorMeetings({ student_id: wardRollNumber }),
    enabled: Boolean(wardRollNumber),
    staleTime: 0,
  });

  return (
    <div className="space-y-4">
      {/* Parent Notice Banner */}
      <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-2xl text-xs font-bold flex items-start gap-2">
        <Bell className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p>You are viewing your ward's attendance as a parent. Attendance below <b>75%</b> in any subject may result in exam hall ticket restrictions.</p>
          {wardRollNumber && <p className="mt-1 text-blue-500 dark:text-blue-400">Ward Roll No: <span className="font-mono">{wardRollNumber}</span></p>}
        </div>
      </div>

      {/* Reuse Student View for ward */}
      <StudentAttendanceView rollNumber={wardRollNumber} />

      {/* Mentor Meeting Logs for parent */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          📋 Mentor Meeting Logs
          <span className="text-xs font-normal text-slate-400">(your ward's mentoring sessions)</span>
        </h3>
        <MeetingLogsView
          logs={meetingLogs}
          isLoading={meetingsLoading}
          showStudent={false}
          emptyMessage="No mentor meetings have been recorded for your ward yet."
        />
      </div>
    </div>
  );
};
