export interface Campus {
  id: string;
  name: string;
  location: string;
  diningHallInfo: {
    capacity: number;
    operatingHours: string;
  };
  classrooms: {
    id: string;
    name: string;
    capacity: number;
    type: string;
  }[];
}

export interface Group {
  id: string;
  name: string;
  campusId: string;
  counts: {
    students: number;
    leaders: number;
  };
  arrival: {
    date: string;
    time: string;
    location: string;
  };
  departure: {
    date: string;
    time: string;
    location: string;
  };
  transferInfo?: {
    fromCampusId: string;
    toCampusId: string;
    date: string;
    time: string;
  };
  notes?: string;
}

export interface Activity {
  id: string;
  name: string;
  location: string;
  duration: number; // in minutes
  capacity: number;
  contact: {
    name: string;
    phone: string;
    email: string;
  };
  availability: {
    startDate: string;
    endDate: string;
    daysOfWeek: number[]; // 0-6 for Sunday-Saturday
    timeSlots: string[]; // e.g., ["09:00", "14:00"]
  };
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  campusId: string;
  availability: {
    startDate: string;
    endDate: string;
    daysOfWeek: number[];
    timeSlots: string[];
  };
}

export interface Class {
  id: string;
  subject: string;
  duration: number; // in minutes
  requiredRole: string;
  roomType: string;
}

export type EventType = 'class' | 'activity' | 'meal' | 'transfer' | 'other';

export interface ScheduledEvent {
  id: string;
  groupId: string;
  eventType: EventType;
  dateTimes: {
    start: string;
    end: string;
  };
  location: string;
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  details: {
    [key: string]: any;
  };
} 