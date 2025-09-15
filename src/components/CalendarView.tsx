import React from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import { Card } from '../types/data';

const localizer = momentLocalizer(moment);

interface CalendarViewProps {
  cards: Card[];
}

const CalendarView: React.FC<CalendarViewProps> = ({ cards }) => {
  // Only include cards that have a valid dueDate
  const toLocalDateOnly = (d: Date | string) => {
    const date = new Date(d);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  };

  const events = cards
    .filter(card => !!card.dueDate && !card.completed)
    .map(card => {
      const start = toLocalDateOnly(card.dueDate!);
      const end = new Date(start);
      end.setDate(end.getDate() + 1); // exclusive end
      return {
        title: card.title,
        start,
        end,
        allDay: true,
        resource: card,
      };
    });

  return (
    <div className="calendar-view" style={{ height: 500 }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
      />
    </div>
  );
};

export default CalendarView;
