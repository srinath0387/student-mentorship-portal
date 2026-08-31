import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { StudentAttendanceView } from './student/StudentAttendanceView';
import { ParentAttendanceView } from './parent/ParentAttendanceView';
import { FacultyAttendancePage } from './faculty/FacultyAttendancePage';
import { HodAttendancePage } from './hod/HodAttendancePage';
import { CoordinatorAttendancePage } from './coordinator/CoordinatorAttendancePage';
import { AttendanceSetupPage } from './admin/AttendanceSetupPage';

export const AttendancePage: React.FC = () => {
  const { user } = useAuth();
  const role = (user?.role || 'student').toLowerCase();

  // 1. Student View
  if (role === 'student') {
    const rollNumber = (
      user?.rollNumber ||
      (user?.email?.includes('@') ? user.email.split('@')[0].toUpperCase() : '')
    );
    return <StudentAttendanceView rollNumber={rollNumber} />;
  }

  // 2. Parent View
  if (role === 'parent') {
    return <ParentAttendanceView />;
  }

  // 3. HOD View
  if (role === 'hod') {
    return <HodAttendancePage />;
  }

  // 4. 1st Year Coordinator View
  if (role === 'coordinator') {
    return <CoordinatorAttendancePage />;
  }

  // 5. Admin / Superadmin View
  if (role === 'admin' || role === 'superadmin') {
    return <AttendanceSetupPage />;
  }

  // 6. Default: Faculty View (for taking / managing attendance)
  return <FacultyAttendancePage />;
};

export default AttendancePage;
