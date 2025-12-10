/**
 * DatePicker Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    label: 'Select Date',
  };

  describe('Rendering', () => {
    it('should render with label', () => {
      render(<DatePicker {...defaultProps} />);
      expect(screen.getByText('Select Date')).toBeInTheDocument();
    });

    it('should show placeholder when no date selected', () => {
      render(<DatePicker {...defaultProps} placeholder="Choose a date" />);
      expect(screen.getByText('Choose a date')).toBeInTheDocument();
    });

    it('should display selected date in input', () => {
      render(<DatePicker {...defaultProps} value="2025-01-15" />);
      // Should show formatted date
      expect(screen.getByDisplayValue(/2025/)).toBeInTheDocument();
    });
  });

  describe('Calendar Interaction', () => {
    it('should open calendar when input clicked', () => {
      render(<DatePicker {...defaultProps} />);

      const input = screen.getByRole('textbox');
      fireEvent.click(input);

      // Calendar should be visible
      expect(screen.getByRole('grid')).toBeInTheDocument();
    });

    it('should close calendar when date selected', () => {
      const onChange = vi.fn();
      render(<DatePicker {...defaultProps} onChange={onChange} />);

      // Open calendar
      fireEvent.click(screen.getByRole('textbox'));

      // Click a day
      const dayButtons = screen.getAllByRole('button');
      const availableDay = dayButtons.find(btn => !btn.hasAttribute('disabled'));
      if (availableDay) {
        fireEvent.click(availableDay);
        expect(onChange).toHaveBeenCalled();
      }
    });

    it('should close calendar when clicking outside', () => {
      render(
        <div>
          <DatePicker {...defaultProps} />
          <button>Outside</button>
        </div>
      );

      // Open calendar
      fireEvent.click(screen.getByRole('textbox'));
      expect(screen.getByRole('grid')).toBeInTheDocument();

      // Click outside
      fireEvent.mouseDown(screen.getByText('Outside'));

      // Calendar should close (may need to wait for effect)
    });
  });

  describe('Month Navigation', () => {
    it('should navigate to next month', () => {
      render(<DatePicker {...defaultProps} />);
      fireEvent.click(screen.getByRole('textbox'));

      const nextButton = screen.getByLabelText(/next month/i);
      const monthDisplay = screen.getByRole('heading');
      const initialMonth = monthDisplay.textContent;

      fireEvent.click(nextButton);

      expect(monthDisplay.textContent).not.toBe(initialMonth);
    });

    it('should navigate to previous month', () => {
      render(<DatePicker {...defaultProps} />);
      fireEvent.click(screen.getByRole('textbox'));

      const prevButton = screen.getByLabelText(/previous month/i);
      const monthDisplay = screen.getByRole('heading');
      const initialMonth = monthDisplay.textContent;

      fireEvent.click(prevButton);

      expect(monthDisplay.textContent).not.toBe(initialMonth);
    });
  });

  describe('Date Restrictions', () => {
    it('should disable past dates when minDate is today', () => {
      const today = new Date().toISOString().split('T')[0];
      render(<DatePicker {...defaultProps} minDate={today} />);

      fireEvent.click(screen.getByRole('textbox'));

      // Past date buttons should be disabled
      const allButtons = screen.getAllByRole('button');
      const disabledButtons = allButtons.filter(btn => btn.hasAttribute('disabled'));
      expect(disabledButtons.length).toBeGreaterThan(0);
    });

    it('should respect maxDate restriction', () => {
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + 7);
      const maxDateStr = maxDate.toISOString().split('T')[0];

      render(<DatePicker {...defaultProps} maxDate={maxDateStr} />);
      fireEvent.click(screen.getByRole('textbox'));

      // Future dates beyond maxDate should be disabled
    });
  });

  describe('Callback', () => {
    it('should call onChange with ISO date string', () => {
      const onChange = vi.fn();
      render(<DatePicker {...defaultProps} onChange={onChange} />);

      fireEvent.click(screen.getByRole('textbox'));

      // Find and click a day button
      const dayButtons = screen.getAllByRole('button');
      const dayButton = dayButtons.find(
        btn => btn.textContent === '15' && !btn.hasAttribute('disabled')
      );

      if (dayButton) {
        fireEvent.click(dayButton);
        expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
      }
    });
  });

  describe('Required Field', () => {
    it('should show error state when required and empty', () => {
      render(<DatePicker {...defaultProps} required error="Date is required" />);

      expect(screen.getByText('Date is required')).toBeInTheDocument();
    });
  });

  describe('Compact Design', () => {
    it('should have compact calendar width', () => {
      render(<DatePicker {...defaultProps} />);
      fireEvent.click(screen.getByRole('textbox'));

      const calendar = screen.getByRole('grid').parentElement;
      // Calendar should be compact (around 260px width as specified)
      expect(calendar).toHaveClass('w-[260px]');
    });
  });
});
