const { Calendar, ChevronLeft, ChevronRight, Plus, Check, X, Tag, Clock, Repeat } = require('lucide-react');
const { useState, useEffect, useRef } = require('react');
const { Button } = require('@/components/ui/button');
const { Card, CardContent } = require('@/components/ui/card');
const { Input } = require('@/components/ui/input');
const { Label } = require('@/components/ui/label');
const { Tabs, TabsList, TabsTrigger } = require('@/components/ui/tabs');
const { Accordion, AccordionContent, AccordionItem, AccordionTrigger } = require('@/components/ui/accordion');
const { Switch } = require('@/components/ui/switch');
const { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } = require('@/components/ui/select');
const { TAG_COLORS } = require('@/lib/colors');
const { fileManager } = require('@/lib/fileManager');
const FullCalendar = require('@fullcalendar/react').default;
const dayGridPlugin = require('@fullcalendar/daygrid').default;
const timeGridPlugin = require('@fullcalendar/timegrid').default;
const interactionPlugin = require('@fullcalendar/interaction').default;
const rrulePlugin = require('@fullcalendar/rrule').default;
const { 
  createBaseCalendarConfig, 
  processEventDates, 
  handleDateSelection, 
  formatDateForDisplay,
  formatTimeWithTimezone,
  createCalendarEvent
} = require('@/lib/calendarUtils');

// Import styles
require('@/styles/fullcalendar.css');

exports.default = {
  name: 'calendar-plugin',
  displayName: 'Calendar',
  version: '1.0.0',
  type: 'landing-tab',
  description: 'Calendar view for your tasks and events',
  icon: Calendar,
  label: 'Calendar',
  component: ({ editor }) => {
    const [view, setView] = useState('dayGridMonth');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [rootDocuments, setRootDocuments] = useState([]);
    const [selectedTags, setSelectedTags] = useState([]);
    const [tagColors, setTagColors] = useState({});
    const calendarRef = useRef(null);
    const [userTimezone, setUserTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

    // Add event listener for tag updates
    useEffect(() => {
      const handleTagUpdate = async () => {
        try {
          const fm = fileManager();
          const docs = await fm.getAllDocuments();
          const rootDocs = docs.filter(doc => !doc.parentDoc);
          
          // Get updated tag colors
          const colorsRecord = await fm._get('settings', 'tagColors');
          const colors = colorsRecord ? colorsRecord.value : {};
          setTagColors(colors);
          
          setRootDocuments(rootDocs);
        } catch (error) {
          console.error('Error updating tags:', error);
        }
      };

      // Listen for tag updates
      window.addEventListener('tagsUpdated', handleTagUpdate);
      
      return () => {
        window.removeEventListener('tagsUpdated', handleTagUpdate);
      };
    }, []);

    // Load root documents and their tags
    useEffect(() => {
      const loadRootDocs = async () => {
        try {
          const fm = fileManager();
          const docs = await fm.getAllDocuments();
          const rootDocs = docs.filter(doc => !doc.parentDoc);
          
          // Get tag colors
          const colorsRecord = await fm._get('settings', 'tagColors');
          const colors = colorsRecord ? colorsRecord.value : {};
          setTagColors(colors);
          
          setRootDocuments(rootDocs);
        } catch (error) {
          console.error('Error loading root documents:', error);
          setRootDocuments([]);
        }
      };
      
      loadRootDocs();
    }, []);

    // Load events from storage when component mounts
    useEffect(() => {
      loadEvents();
    }, []);

    const loadEvents = async () => {
      try {
        const storedEvents = localStorage.getItem('calendar_events');
        if (storedEvents) {
          // Parse and clean up events
          let events = JSON.parse(storedEvents);
          
          // Migrate/fix any events with invalid duration
          events = events.map(event => {
            // Create a clean copy of the event
            const cleanEvent = { ...event };
            
            // Remove invalid duration if present
            if (cleanEvent.duration) {
              delete cleanEvent.duration;
            }
            
            // Fix recurring events
            if (cleanEvent.rrule) {
              // Remove duration from rrule if present
              if (cleanEvent.rrule.duration) {
                delete cleanEvent.rrule.duration;
              }
              
              // Calculate proper duration if it's a multi-day event
              if (cleanEvent.allDay && cleanEvent.start && cleanEvent.end) {
                const startDate = new Date(cleanEvent.start);
                const endDate = new Date(cleanEvent.end);
                const durationInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                if (durationInDays > 1) {
                  cleanEvent.duration = { days: durationInDays };
                }
              } else if (!cleanEvent.allDay && cleanEvent.start && cleanEvent.end) {
                const startMs = new Date(cleanEvent.start).getTime();
                const endMs = new Date(cleanEvent.end).getTime();
                const durationInMs = endMs - startMs;
                
                if (durationInMs > 0) {
                  const hours = Math.floor(durationInMs / (1000 * 60 * 60));
                  const minutes = Math.floor((durationInMs % (1000 * 60 * 60)) / (1000 * 60));
                  const seconds = Math.floor((durationInMs % (1000 * 60)) / 1000);
                  
                  const duration = {};
                  if (hours > 0) duration.hours = hours;
                  if (minutes > 0) duration.minutes = minutes;
                  if (seconds > 0) duration.seconds = seconds;
                  
                  cleanEvent.duration = duration;
                }
              }
            }
            
            return cleanEvent;
          });
          
          // Save cleaned up events back to storage
          localStorage.setItem('calendar_events', JSON.stringify(events));
          setEvents(events);
        }
      } catch (error) {
        console.error('Error loading events:', error);
        setEvents([]);
      }
    };

    const saveEvents = async (updatedEvents) => {
      try {
        localStorage.setItem('calendar_events', JSON.stringify(updatedEvents));
        setEvents(updatedEvents);
      } catch (error) {
        console.error('Error saving events:', error);
      }
    };

    // Filter events based on selected tags
    const getEventStyle = (event) => {
      if (selectedTags.length === 0) return event;
      
      const isTagged = event.tags && event.tags.some(tag => selectedTags.includes(tag));
      if (!isTagged) {
        return {
          ...event,
          backgroundColor: 'var(--muted)',
          textColor: 'var(--muted-foreground)',
          classNames: 'opacity-50'
        };
      }
      return event;
    };

    const filteredEvents = events.map(getEventStyle);

    // Get initial color for new event based on selected tag
    const getInitialEventColor = (tags) => {
      if (!tags || tags.length === 0) return 'gray';
      const firstTag = tags[0];
      const doc = rootDocuments.find(doc => doc.tags && doc.tags.includes(firstTag));
      if (doc && doc.tags && doc.tags[0]) {
        const colorName = tagColors[doc.tags[0]] || 'gray';
        return colorName;
      }
      return 'gray';
    };

    const handleDateSelect = (info) => {
      // Use the utility function to process date selection
      const processedInfo = handleDateSelection(info);
      
      // Set the event with correct tags and color
      setSelectedEvent({
        ...processedInfo,
        tags: selectedTags,
        color: getInitialEventColor(selectedTags)
      });
      
      setSidebarOpen(true);
    };

    // Toggle tag selection
    const toggleTag = (tag) => {
      setSelectedTags(prev => 
        prev.includes(tag) 
          ? prev.filter(t => t !== tag)
          : [...prev, tag]
      );
    };

    // Get all unique tags from root documents
    const allTags = [...new Set(rootDocuments.flatMap(doc => doc.tags || []))];

    // Handle view change
    const handleViewChange = (newView) => {
      setView(newView);
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        calendarApi.changeView(newView);
        setCurrentDate(calendarApi.getDate());
      }
    };

    // Navigation handlers
    const handlePrevious = () => {
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        calendarApi.prev();
        setCurrentDate(calendarApi.getDate());
      }
    };

    const handleNext = () => {
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        calendarApi.next();
        setCurrentDate(calendarApi.getDate());
      }
    };

    const handleToday = () => {
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        calendarApi.today();
        setCurrentDate(calendarApi.getDate());
      }
    };

    const handleEventClick = (info) => {
      const event = events.find(e => e.id === info.event.id);
      if (!event) return;
      
      // Process the event to ensure timezone consistency
      const processedEvent = processEventDates(event);
      setSelectedEvent(processedEvent);
      setSidebarOpen(true);
    };

    const handleSaveEvent = (eventData) => {
      // Process event for timezone consistency before saving
      const processedEvent = processEventDates(eventData);
      
      const updatedEvents = selectedEvent?.id
        ? events.map(e => e.id === selectedEvent.id ? { ...processedEvent, id: selectedEvent.id } : e)
        : [...events, { ...processedEvent, id: Date.now().toString() }];
      
      saveEvents(updatedEvents);
      setSidebarOpen(false);
      setSelectedEvent(null);
    };

    const handleDeleteEvent = () => {
      if (selectedEvent?.id) {
        const updatedEvents = events.filter(e => e.id !== selectedEvent.id);
        saveEvents(updatedEvents);
      }
      setSidebarOpen(false);
      setSelectedEvent(null);
    };

    const formatViewTitle = () => {
      if (!calendarRef.current) return '';
      const api = calendarRef.current.getApi();
      return api.view.title;
    };

    const EventSidebar = ({ open, onClose, event, onSave, onDelete }) => {
      const [title, setTitle] = useState(event?.title || '');
      const [start, setStart] = useState('');
      const [end, setEnd] = useState('');
      const [selectedColor, setSelectedColor] = useState(event?.color || getInitialEventColor(event?.tags));
      const [eventTags, setEventTags] = useState(event?.tags || []);
      const [allDay, setAllDay] = useState(event?.allDay || false);
      const [startTime, setStartTime] = useState('');
      const [endTime, setEndTime] = useState('');
      const [isRecurring, setIsRecurring] = useState(false);
      const [recurrence, setRecurrence] = useState({
        freq: 'WEEKLY',
        interval: 1,
        byweekday: [],
        until: null,
        dtstart: null
      });

      useEffect(() => {
        if (event) {
          setTitle(event.title || '');
          setSelectedColor(event?.color || getInitialEventColor(event?.tags));
          setEventTags(event?.tags || []);
          setAllDay(event?.allDay || false);
          
          // Start date handling
          if (event.start) {
            if (typeof event.start === 'string') {
              // Handle date string format
              if (event.start.includes('T')) {
                // ISO format
                setStart(event.start.split('T')[0]);
              } else {
                // Just date
                setStart(event.start);
              }
            } else {
              // Handle Date object
              setStart(event.start.toISOString().split('T')[0]);
            }
          } else {
            setStart('');
          }
          
          // End date handling
          if (event.end) {
            if (typeof event.end === 'string') {
              // Handle date string format
              if (event.end.includes('T')) {
                // ISO format
                setEnd(event.end.split('T')[0]);
              } else {
                // Just date
                setEnd(event.end);
              }
            } else {
              // Handle Date object
              setEnd(event.end.toISOString().split('T')[0]);
            }
          } else {
            setEnd('');
          }
          
          // Handle start time
          if (event.initialStartTime) {
            // Use provided initial time
            setStartTime(event.initialStartTime);
          } else if (event.start && !event.allDay) {
            // Extract time from start date
            const startDate = new Date(event.start);
            if (!isNaN(startDate.getTime())) {
              setStartTime(
                startDate.getHours().toString().padStart(2, '0') + ':' +
                startDate.getMinutes().toString().padStart(2, '0')
              );
            } else {
              setStartTime('09:00'); // Default time if date is invalid
            }
          } else {
            setStartTime('09:00'); // Default time
          }

          // Handle end time
          if (event.initialEndTime) {
            // Use provided initial time
            setEndTime(event.initialEndTime);
          } else if (event.end && !event.allDay) {
            // Extract time from end date
            const endDate = new Date(event.end);
            if (!isNaN(endDate.getTime())) {
              setEndTime(
                endDate.getHours().toString().padStart(2, '0') + ':' +
                endDate.getMinutes().toString().padStart(2, '0')
              );
            } else {
              setEndTime('10:00'); // Default time if date is invalid
            }
          } else {
            setEndTime('10:00'); // Default time
          }

          // Handle recurrence
          if (event.rrule) {
            setIsRecurring(true);
            setRecurrence({
              freq: event.rrule.freq || 'WEEKLY',
              interval: event.rrule.interval || 1,
              byweekday: event.rrule.byweekday || [],
              until: event.rrule.until || null,
              dtstart: event.rrule.dtstart ? new Date(event.rrule.dtstart) : null
            });
          } else {
            setIsRecurring(false);
            setRecurrence({
              freq: 'WEEKLY',
              interval: 1,
              byweekday: [],
              until: null,
              dtstart: null
            });
          }
        } else {
          // Reset form for new events
          setTitle('');
          setSelectedColor(getInitialEventColor(selectedTags));
          setEventTags(selectedTags);
          setAllDay(false);
          
          // Set default times for a new event
          const now = new Date();
          const today = now.toISOString().split('T')[0];
          setStart(today);
          setEnd(today);
          
          // Set default start/end times (rounded to nearest half hour)
          const roundedMinutes = Math.ceil(now.getMinutes() / 30) * 30;
          const hours = now.getHours() + Math.floor(roundedMinutes / 60);
          const minutes = roundedMinutes % 60;
          
          const startTimeStr = hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0');
          setStartTime(startTimeStr);
          
          // End time is one hour later
          const endHours = hours + 1;
          setEndTime(endHours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0'));
          
          setIsRecurring(false);
          setRecurrence({
            freq: 'WEEKLY',
            interval: 1,
            byweekday: [],
            until: null,
            dtstart: null
          });
        }
      }, [event, selectedTags]);

      // Safely format date/time for display
      const safeFormatDateTime = (dateStr, timeStr) => {
        if (!dateStr) return '';
        
        try {
          // Create a properly formatted date
          const date = new Date(dateStr);
          
          // For all-day events, just return the date
          if (allDay) {
            return formatDateForDisplay(date);
          }
          
          // For timed events, add the time
          if (timeStr) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            date.setHours(hours, minutes);
            
            return formatDateForDisplay(date, true);
          }
          
          return formatDateForDisplay(date);
        } catch (e) {
          console.error("Date formatting error:", e);
          return 'Invalid date';
        }
      };

      // Get formatted date and time for display in the header
      const getFormattedDateTimeRange = () => {
        if (!start) return '';

        try {
          // Format start date/time
          const startFormatted = safeFormatDateTime(start, allDay ? null : startTime);
          
          // If no end date or same as start, just return start
          if (!end || start === end) {
            return startFormatted;
          }
          
          // Format end date/time
          const endFormatted = safeFormatDateTime(end, allDay ? null : endTime);
          
          // Return the range
          return `${startFormatted} – ${endFormatted}`;
        } catch (error) {
          console.error("Error formatting date range:", error);
          return 'Invalid date range';
        }
      };

      const handleSubmit = (e) => {
        e.preventDefault();
        
        // Create the event using our utility
        const eventData = createCalendarEvent({
          id: event?.id,
          title,
          start,
          end,
          allDay,
          startTime,
          endTime,
          tags: eventTags,
          color: selectedColor,
          // Get color information from the selected color
          backgroundColor: TAG_COLORS[selectedColor].bg.match(/#[0-9A-Fa-f]{6}/)?.[0],
          textColor: TAG_COLORS[selectedColor].text === 'text-black' ? '#000000' : '#FFFFFF',
          // Add recurrence if enabled
          rrule: isRecurring ? {
            freq: recurrence.freq,
            interval: recurrence.interval,
            dtstart: allDay ? start : (() => {
              const [hours, minutes] = startTime.split(':').map(Number);
              const startDate = new Date(start);
              startDate.setHours(hours, minutes, 0, 0);
              return startDate.toISOString();
            })(),
            tzid: userTimezone,
            until: recurrence.until ? (allDay ? (() => {
              const untilDate = new Date(recurrence.until);
              untilDate.setHours(23, 59, 59, 999);
              return untilDate.toISOString();
            })() : (() => {
              const untilDate = new Date(recurrence.until);
              untilDate.setHours(23, 59, 59, 999);
              return untilDate.toISOString();
            })()) : null,
            byweekday: recurrence.freq === 'WEEKLY' && recurrence.byweekday.length > 0 ? 
              recurrence.byweekday : undefined
          } : null
        });

        // For recurring events, we need to set the duration separately
        if (isRecurring && eventData.rrule) {
          if (allDay) {
            // For all-day events, calculate the end date
            const startDate = new Date(start);
            const endDate = new Date(end);
            const durationInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
            if (durationInDays > 1) {
              eventData.duration = { days: durationInDays };
            }
          } else {
            // For timed events, calculate the duration in milliseconds
            const startDateTime = new Date(start + 'T' + startTime);
            const endDateTime = new Date(end + 'T' + endTime);
            const durationInMs = endDateTime - startDateTime;
            if (durationInMs > 0) {
              // Convert to object with hours/minutes/seconds
              const hours = Math.floor(durationInMs / (1000 * 60 * 60));
              const minutes = Math.floor((durationInMs % (1000 * 60 * 60)) / (1000 * 60));
              const seconds = Math.floor((durationInMs % (1000 * 60)) / 1000);
              
              const duration = {};
              if (hours > 0) duration.hours = hours;
              if (minutes > 0) duration.minutes = minutes;
              if (seconds > 0) duration.seconds = seconds;
              
              eventData.duration = duration;
            }
          }
        }

        onSave(eventData);
      };

      // Update weekdays array to use proper RRule weekday values
      const weekdays = [
        { value: 'MO', label: 'Monday' },
        { value: 'TU', label: 'Tuesday' },
        { value: 'WE', label: 'Wednesday' },
        { value: 'TH', label: 'Thursday' },
        { value: 'FR', label: 'Friday' },
        { value: 'SA', label: 'Saturday' },
        { value: 'SU', label: 'Sunday' }
      ];

      const toggleWeekday = (day) => {
        setRecurrence(prev => ({
          ...prev,
          byweekday: prev.byweekday?.includes(day)
            ? (prev.byweekday || []).filter(d => d !== day)
            : [...(prev.byweekday || []), day]
        }));
      };

      // Group colors by category
      const colorCategories = {
        'Dark Colors': ['signalBlack', 'black', 'darkTeal', 'earth', 'forest'],
        'Reds & Pinks': ['red', 'watermelon', 'raspberry', 'pink', 'blush'],
        'Purples': ['purple', 'amethystBellflower', 'taupe'],
        'Oranges & Yellows': ['clementine', 'apricot', 'orange', 'lemonAndBanana', 'sunshine', 'smiles'],
        'Greens': ['mint', 'meadow', 'lightMalachite'],
        'Blues': ['azureCornflower', 'brightSky', 'seaBlue', 'moss', 'cyan'],
        'Neutrals': ['creamy', 'cotton', 'mushroom', 'white', 'gray', 'cuppa']
      };

      // Toggle tag for event
      const toggleEventTag = (tag) => {
        setEventTags(prev => 
          (prev || []).includes(tag) 
            ? (prev || []).filter(t => t !== tag)
            : [...(prev || []), tag]
        );
      };

      return (
        <div 
          className={`fixed inset-y-0 right-0 w-[400px] bg-background border-l shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex flex-col p-4 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {event?.id ? 'Edit Event' : 'New Event'}
                </h3>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Display formatted date/time range if available */}
              {start && (
                <p className="text-sm text-muted-foreground mt-1">
                  {getFormattedDateTimeRange()}
                </p>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Event title"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id="all-day"
                    checked={allDay}
                    onCheckedChange={setAllDay}
                  />
                  <Label htmlFor="all-day">All day</Label>
                </div>

                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="start">Start</Label>
                    <div className="flex gap-2">
                      <Input
                        id="start"
                        type="date"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                      />
                      {!allDay && (
                        <Input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                        />
                      )}
                    </div>
                    {!allDay && startTime && start && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {safeFormatDateTime(start, startTime)}
                      </div>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="end">End</Label>
                    <div className="flex gap-2">
                      <Input
                        id="end"
                        type="date"
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                      />
                      {!allDay && (
                        <Input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                        />
                      )}
                    </div>
                    {!allDay && endTime && end && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {safeFormatDateTime(end, endTime)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Project Tags */}
                <div className="space-y-2">
                  <Label>Project Tags</Label>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map(tag => {
                      const doc = rootDocuments.find(doc => doc.tags && doc.tags.includes(tag));
                      const colorName = doc && doc.tags && doc.tags[0] ? tagColors[doc.tags[0]] || 'gray' : 'gray';
                      const colorSet = TAG_COLORS[colorName];
                      const bgColor = colorSet.bg.match(/#[0-9A-Fa-f]{6}/)?.[0];
                      const isSelected = (eventTags || []).includes(tag);

                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            toggleEventTag(tag);
                            if (!isSelected) {
                              setSelectedColor(colorName);
                            }
                          }}
                          className={`px-2 py-1 rounded-md text-sm flex items-center gap-1 transition-all ${
                            isSelected ? 'ring-2 ring-primary' : ''
                          }`}
                          style={{ 
                            backgroundColor: bgColor,
                            color: colorSet.text === 'text-black' ? '#000000' : '#FFFFFF'
                          }}
                        >
                          <Tag className="h-3 w-3" />
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Recurrence Options */}
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="recurrence">
                    <AccordionTrigger className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Repeat className="h-4 w-4" />
                        Recurrence
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            id="recurring"
                            checked={isRecurring}
                            onCheckedChange={setIsRecurring}
                          />
                          <Label htmlFor="recurring">Repeat this event</Label>
                        </div>

                        {isRecurring && (
                          <div className="space-y-4">
                            <div>
                              <Label>Frequency</Label>
                              <Select
                                value={recurrence.freq}
                                onValueChange={(value) => 
                                  setRecurrence(prev => ({ ...prev, freq: value }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="DAILY">Daily</SelectItem>
                                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                                  <SelectItem value="YEARLY">Yearly</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label>Interval</Label>
                              <Input
                                type="number"
                                min="1"
                                value={recurrence.interval}
                                onChange={(e) => 
                                  setRecurrence(prev => ({ 
                                    ...prev, 
                                    interval: parseInt(e.target.value) || 1 
                                  }))
                                }
                              />
                            </div>

                            {recurrence.freq === 'WEEKLY' && (
                              <div>
                                <Label>Repeat on</Label>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {weekdays.map(day => (
                                    <Button
                                      key={day.value}
                                      type="button"
                                      variant={(recurrence.byweekday || []).includes(day.value) ? 'default' : 'outline'}
                                      className="h-8 w-8"
                                      onClick={() => toggleWeekday(day.value)}
                                    >
                                      {day.value.slice(0, 1)}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div>
                              <Label>Until</Label>
                              <Input
                                type="date"
                                value={recurrence.until || ''}
                                onChange={(e) => 
                                  setRecurrence(prev => ({ 
                                    ...prev, 
                                    until: e.target.value || null 
                                  }))
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="colors">
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ 
                            backgroundColor: TAG_COLORS[selectedColor].bg.match(/#[0-9A-Fa-f]{6}/)?.[0] 
                          }} 
                        />
                        Event Color
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4">
                        {Object.entries(colorCategories).map(([category, colors]) => (
                          <div key={category}>
                            <h4 className="text-sm font-medium mb-2">{category}</h4>
                            <div className="grid grid-cols-5 gap-2">
                              {colors.map(colorName => {
                                const colorSet = TAG_COLORS[colorName];
                                const bgColor = colorSet.bg.match(/#[0-9A-Fa-f]{6}/)?.[0];
                                return (
                                  <button
                                    key={colorName}
                                    type="button"
                                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                      selectedColor === colorName ? 'ring-2 ring-primary ring-offset-2' : ''
                                    }`}
                                    style={{ backgroundColor: bgColor }}
                                    onClick={() => setSelectedColor(colorName)}
                                    title={colorName}
                                  >
                                    {selectedColor === colorName && (
                                      <Check className="h-4 w-4" style={{ color: colorSet.text === 'text-black' ? '#000000' : '#FFFFFF' }} />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </form>
            </div>

            {/* Footer */}
            <div className="border-t p-4 flex justify-between">
              {event?.id && (
                <Button type="button" variant="destructive" onClick={onDelete}>
                  Delete
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col w-full h-[calc(100vh-3rem)] bg-background">
        <div className="flex flex-col flex-1 p-8 space-y-4">
          {/* Tag Filters */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => {
                const doc = rootDocuments.find(doc => doc.tags && doc.tags.includes(tag));
                const colorName = doc && doc.tags && doc.tags[0] ? tagColors[doc.tags[0]] || 'gray' : 'gray';
                const colorSet = TAG_COLORS[colorName];
                const bgColor = colorSet.bg.match(/#[0-9A-Fa-f]{6}/)?.[0];
                const isSelected = selectedTags.includes(tag);

                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition-all ${
                      isSelected ? 'ring-2 ring-primary' : ''
                    }`}
                    style={{ 
                      backgroundColor: bgColor,
                      color: colorSet.text === 'text-black' ? '#000000' : '#FFFFFF'
                    }}
                  >
                    <Tag className="h-4 w-4" />
                    {tag}
                  </button>
                );
              })}
            </div>
          )}

          {/* Custom Toolbar */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={handlePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="ml-2" onClick={handleToday}>
                Today
              </Button>
              <h2 className="text-lg font-semibold ml-4">{formatViewTitle()}</h2>
            </div>
            <div className="flex items-center gap-4">
              <Tabs value={view} onValueChange={handleViewChange}>
                <TabsList>
                  <TabsTrigger value="dayGridMonth">Month</TabsTrigger>
                  <TabsTrigger value="timeGridWeek">Week</TabsTrigger>
                  <TabsTrigger value="timeGridDay">Day</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button onClick={() => setSidebarOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Event
              </Button>
            </div>
          </div>

          {/* Calendar */}
          <Card className="flex-1 shadow-none border overflow-hidden min-h-0">
            <CardContent className="p-0 h-full">
              <div className="h-full">
                <FullCalendar
                  ref={calendarRef}
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, rrulePlugin]}
                  initialView={view}
                  headerToolbar={false}
                  events={filteredEvents}
                  {...createBaseCalendarConfig({
                    datesSet: (dateInfo) => {
                      setCurrentDate(dateInfo.view.currentStart);
                    },
                    select: (info) => {
                      handleDateSelect(info);
                    },
                    eventClick: (info) => handleEventClick(info)
                  })}
                  eventContent={(arg) => {
                    const event = events.find(e => e.id === arg.event.id);
                    if (!event) return null;
                    
                    const colorSet = TAG_COLORS[event?.color || 'gray'];
                    const textColor = colorSet.text === 'text-black' ? '#000000' : '#FFFFFF';
                    
                    // Get the time in local timezone
                    const timeDisplay = arg.event.allDay ? 
                      '' : 
                      new Intl.DateTimeFormat(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      }).format(arg.event.start);
                    
                    return (
                      <div 
                        className="flex items-center gap-1 w-full h-full px-1" 
                        style={{ 
                          color: textColor,
                          backgroundColor: arg.event.backgroundColor,
                          borderRadius: '4px'
                        }}
                      >
                        <span className="truncate">{arg.event.title || 'Untitled Event'}</span>
                        {!arg.event.allDay && arg.view.type !== 'timeGridWeek' && arg.view.type !== 'timeGridDay' && (
                          <span className="text-xs whitespace-nowrap">
                            {timeDisplay}
                          </span>
                        )}
                      </div>
                    );
                  }}
                  eventClassNames={(arg) => {
                    return ['overflow-hidden', 'border-none'];
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <EventSidebar
          open={sidebarOpen}
          onClose={() => {
            setSidebarOpen(false);
            setSelectedEvent(null);
          }}
          event={selectedEvent}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
        />
      </div>
    );
  }
}; 