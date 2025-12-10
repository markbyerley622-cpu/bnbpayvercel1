/**
 * Custom DatePicker Component
 *
 * A compact, fully styled date picker with BNB yellow/black theme.
 * Replaces default browser date picker with consistent UI.
 */

import { useState, useRef, useEffect } from 'react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  className?: string;
  error?: boolean;
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  minDate,
  maxDate,
  className = '',
  error = false,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      return new Date(value);
    }
    return new Date();
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse date strings
  const parsedValue = value ? new Date(value) : null;
  const parsedMin = minDate ? new Date(minDate) : null;
  const parsedMax = maxDate ? new Date(maxDate) : null;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Get days in month
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Get first day of month (0 = Sunday, 6 = Saturday)
  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  // Generate calendar days
  const generateCalendarDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days: (number | null)[] = [];

    // Add empty slots for days before the first day
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    return days;
  };

  // Check if a date is disabled
  const isDateDisabled = (day: number) => {
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    if (parsedMin && date < parsedMin) return true;
    if (parsedMax && date > parsedMax) return true;
    return false;
  };

  // Check if a date is today
  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      viewDate.getMonth() === today.getMonth() &&
      viewDate.getFullYear() === today.getFullYear()
    );
  };

  // Check if a date is selected
  const isSelected = (day: number) => {
    if (!parsedValue) return false;
    return (
      day === parsedValue.getDate() &&
      viewDate.getMonth() === parsedValue.getMonth() &&
      viewDate.getFullYear() === parsedValue.getFullYear()
    );
  };

  // Handle day click
  const handleDayClick = (day: number) => {
    if (isDateDisabled(day)) return;

    const selectedDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    // Format as YYYY-MM-DD for input[type="date"] compatibility
    const formatted = selectedDate.toISOString().split('T')[0];
    onChange(formatted);
    setIsOpen(false);
  };

  // Navigate months
  const goToPreviousMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // Format display value
  const formatDisplayValue = () => {
    if (!parsedValue) return '';
    return parsedValue.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const calendarDays = generateCalendarDays();

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input Field */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 bg-bnb-gray border-2 text-white rounded-xl cursor-pointer transition-colors flex items-center justify-between ${
          error
            ? 'border-red-500'
            : isOpen
            ? 'border-bnb-yellow'
            : 'border-bnb-gray hover:border-bnb-yellow/50'
        }`}
      >
        <span className={parsedValue ? 'text-white text-sm' : 'text-gray-500 text-sm'}>
          {parsedValue ? formatDisplayValue() : placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-bnb-yellow transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      {/* Calendar Dropdown - Compact Version */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-[260px] bg-bnb-dark border border-bnb-yellow/30 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
          {/* Header - Compact */}
          <div className="flex items-center justify-between px-2 py-2 bg-bnb-gray/80 border-b border-bnb-yellow/20">
            <button
              type="button"
              onClick={goToPreviousMonth}
              className="p-1 hover:bg-bnb-yellow/20 rounded transition-colors"
            >
              <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-white font-semibold text-sm">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <button
              type="button"
              onClick={goToNextMonth}
              className="p-1 hover:bg-bnb-yellow/20 rounded transition-colors"
            >
              <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day Names - Compact */}
          <div className="grid grid-cols-7 gap-0 px-2 py-1 bg-bnb-gray/30">
            {DAYS.map((day, i) => (
              <div
                key={i}
                className="text-center text-[10px] font-semibold text-bnb-yellow/70 py-0.5"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid - Compact */}
          <div className="grid grid-cols-7 gap-0.5 p-2">
            {calendarDays.map((day, index) => (
              <div key={index} className="aspect-square flex items-center justify-center">
                {day !== null ? (
                  <button
                    type="button"
                    onClick={() => handleDayClick(day)}
                    disabled={isDateDisabled(day)}
                    className={`w-7 h-7 flex items-center justify-center rounded text-xs font-medium transition-all ${
                      isSelected(day)
                        ? 'bg-bnb-yellow text-bnb-dark font-bold'
                        : isToday(day)
                        ? 'bg-bnb-yellow/20 text-bnb-yellow ring-1 ring-bnb-yellow/50'
                        : isDateDisabled(day)
                        ? 'text-gray-600 cursor-not-allowed'
                        : 'text-white hover:bg-bnb-yellow/20 hover:text-bnb-yellow'
                    }`}
                  >
                    {day}
                  </button>
                ) : (
                  <div className="w-7 h-7" />
                )}
              </div>
            ))}
          </div>

          {/* Footer Actions - Compact */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-bnb-gray/30 border-t border-bnb-yellow/20">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setViewDate(today);
                const formatted = today.toISOString().split('T')[0];
                onChange(formatted);
                setIsOpen(false);
              }}
              className="px-2 py-1 text-xs text-bnb-yellow hover:bg-bnb-yellow/20 rounded transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DatePicker;
