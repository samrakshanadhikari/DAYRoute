import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

const locations = {
  current: 'Alkek Library',
  library: 'Alkek Library',
  ingram: 'Ingram Hall',
  nearby: 'Nearby Cafe',
  heb: 'H-E-B on University',
  home: 'Home',
};

const travelTimes = {
  'Alkek Library->Ingram Hall': 12,
  'Alkek Library->Nearby Cafe': 5,
  'Nearby Cafe->Ingram Hall': 12,
  'Ingram Hall->Nearby Cafe': 12,
  'Ingram Hall->H-E-B on University': 15,
  'H-E-B on University->Home': 18,
  'Home->Alkek Library': 16,
};

const dayStart = 8 * 60;
const dayEnd = 22 * 60;
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const todayName = weekdays[new Date().getDay()];

const seedTasks = [];

const seedWeeklySchedule = {
  Sunday: [],
  Monday: [],
  Tuesday: [],
  Wednesday: [],
  Thursday: [],
  Friday: [],
  Saturday: [],
};

const demoGoogleCalendarEvents = {
  Monday: [
    { id: 'gcal-mon-work-shift', title: 'Work Shift', startsAt: 16 * 60, duration: 120, location: locations.home, fixed: true, source: 'Google Calendar' },
  ],
  Tuesday: [
    { id: 'gcal-tue-team-meeting', title: 'Team Meeting', startsAt: 13 * 60 + 30, duration: 45, location: locations.library, fixed: true, source: 'Google Calendar' },
  ],
  Wednesday: [
    { id: 'gcal-wed-advising', title: 'Advising Appointment', startsAt: 15 * 60, duration: 30, location: locations.ingram, fixed: true, source: 'Google Calendar' },
  ],
  Thursday: [
    { id: 'gcal-thu-doctor', title: 'Doctor Appointment', startsAt: 9 * 60 + 30, duration: 60, location: locations.home, fixed: true, source: 'Google Calendar' },
  ],
  Friday: [
    { id: 'gcal-fri-project-review', title: 'Project Review', startsAt: 14 * 60, duration: 45, location: locations.library, fixed: true, source: 'Google Calendar' },
  ],
  Saturday: [
    { id: 'gcal-sat-family', title: 'Family Commitment', startsAt: 12 * 60, duration: 90, location: locations.home, fixed: true, source: 'Google Calendar' },
  ],
};

const pad = (value) => String(value).padStart(2, '0');
const formatTime = (minutes) => {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour = hour24 % 12 || 12;
  return `${hour}:${pad(minute)} ${period}`;
};

const parseClockTime = (value) => {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3]?.toLowerCase();

  if (hour > 23 || minute > 59) return null;
  if (period && (hour < 1 || hour > 12)) return null;
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return hour * 60 + minute;
};

const hasScheduleConflict = (events, candidate) => events.some((event) => {
  const eventEnd = event.startsAt + event.duration;
  const candidateEnd = candidate.startsAt + candidate.duration;
  return candidate.startsAt < eventEnd && candidateEnd > event.startsAt;
});

const applyClockPeriod = (value, period) => {
  const base = value.trim().replace(/\s*(am|pm)$/i, '');
  return base ? `${base} ${period}` : '';
};

const travelService = {
  getTravelTime(from, to) {
    if (!from || !to || from === 'No location set' || to === 'No location set') return 0;
    if (from === to) return 0;
    return travelTimes[`${from}->${to}`] ?? travelTimes[`${to}->${from}`] ?? 10;
  },
};

const getMapsUrl = (destination, coords) => {
  const params = [`api=1`, `destination=${encodeURIComponent(destination)}`, `travelmode=walking`];
  if (coords) params.push(`origin=${coords.latitude},${coords.longitude}`);
  return `https://www.google.com/maps/dir/?${params.join('&')}`;
};

function planDay(tasks, commitments, scenario) {
  const priorityScore = { High: 0, Medium: 1, Low: 2 };
  const sortedCommitments = [...commitments].sort((a, b) => a.startsAt - b.startsAt);
  const openTasks = [...tasks]
    .filter((task) => !task.complete)
    .sort((a, b) => {
      const priorityDifference = priorityScore[a.priority] - priorityScore[b.priority];
      if (priorityDifference !== 0) return priorityDifference;
      return getDeadlineScore(a.deadline) - getDeadlineScore(b.deadline);
    });

  const remainingTasks = [...openTasks];
  const route = [];
  let cursor = dayStart;
  let place = locations.current;
  let delayApplied = false;

  const takeBestTaskForGap = (gapEnd, nextLocation) => {
    const options = remainingTasks
      .map((task, index) => {
        const extraDelay = scenario === 'delay' && !delayApplied && task.priority === 'High' ? 20 : 0;
        const duration = task.duration + extraDelay;
        const travelToTask = travelService.getTravelTime(place, task.location);
        const travelToNext = nextLocation ? travelService.getTravelTime(task.location, nextLocation) : 0;
        const totalTime = travelToTask + duration + travelToNext;

        return {
          index,
          task,
          duration,
          travelToTask,
          totalTime,
          score: (priorityScore[task.priority] * 100) + (getDeadlineScore(task.deadline) * 20) + travelToTask + duration / 10,
        };
      })
      .filter((option) => cursor + option.totalTime <= gapEnd)
      .sort((a, b) => a.score - b.score);

    const selected = options[0];
    if (!selected) return false;

    if (selected.travelToTask > 0) {
      route.push({
        id: `travel-${selected.task.id}-${cursor}`,
        kind: 'travel',
        title: `Travel to ${selected.task.title}`,
        start: cursor,
        end: cursor + selected.travelToTask,
        location: selected.task.location,
        travel: selected.travelToTask,
      });
      cursor += selected.travelToTask;
    }

    const moved = scenario === 'delay' && !delayApplied && selected.task.priority === 'High';
    route.push({
      id: selected.task.id,
      kind: 'task',
      title: selected.task.title,
      start: cursor,
      end: cursor + selected.duration,
      location: selected.task.location,
      travel: selected.travelToTask,
      priority: selected.task.priority,
      moved,
    });

    cursor += selected.duration;
    place = selected.task.location;
    delayApplied = delayApplied || moved;
    remainingTasks.splice(selected.index, 1);
    return true;
  };

  const fillGap = (gapEnd, nextLocation) => {
    while (cursor < gapEnd && takeBestTaskForGap(gapEnd, nextLocation)) {
      // Keep filling this open window with tasks that realistically fit.
    }
    cursor = Math.max(cursor, gapEnd);
  };

  sortedCommitments.forEach((commitment) => {
    fillGap(commitment.startsAt, commitment.location);

    const travel = travelService.getTravelTime(place, commitment.location);
    if (travel > 0 && cursor <= commitment.startsAt) {
      route.push({
        id: `travel-${commitment.id}`,
        kind: 'travel',
        title: `Travel to ${commitment.title}`,
        start: Math.max(dayStart, commitment.startsAt - travel),
        end: commitment.startsAt,
        location: commitment.location,
        travel,
      });
    }

    route.push({
      ...commitment,
      kind: 'commitment',
      start: commitment.startsAt,
      end: commitment.startsAt + commitment.duration,
      travel,
    });
    cursor = Math.max(cursor, commitment.startsAt + commitment.duration);
    place = commitment.location;
  });

  while (remainingTasks.length && cursor < dayEnd) {
    if (!takeBestTaskForGap(dayEnd, null)) break;
  }

  const travelTotal = route.reduce((sum, item) => sum + (item.travel || 0), 0);
  const plannedTaskCount = route.filter((item) => item.kind === 'task').length;

  return {
    route,
    stats: {
      completed: tasks.filter((task) => task.complete).length + plannedTaskCount,
      travelTotal,
      buffer: Math.max(0, dayEnd - cursor),
      missed: 0,
    },
  };
}

const getDayLabel = (day, items) => items.length ? `${day} fixed schedule` : `${day} is open`;

const getDeadlineScore = (deadline) => {
  const text = deadline.toLowerCase();
  if (text.includes('today')) return 0;
  if (text.includes('tomorrow')) return 1;
  if (text.includes('flex')) return 3;
  return 2;
};

const findScheduleGaps = (commitments) => {
  const sorted = [...commitments].sort((a, b) => a.startsAt - b.startsAt);
  const gaps = [];
  let cursor = dayStart;
  let previousLocation = locations.current;

  sorted.forEach((item) => {
    if (item.startsAt > cursor) {
      gaps.push({
        id: `gap-${cursor}-${item.startsAt}`,
        start: cursor,
        end: item.startsAt,
        fromLocation: previousLocation,
        nextLocation: item.location,
        nextTitle: item.title,
      });
    }
    cursor = Math.max(cursor, item.startsAt + item.duration);
    previousLocation = item.location;
  });

  if (cursor < dayEnd) {
    gaps.push({
      id: `gap-${cursor}-${dayEnd}`,
      start: cursor,
      end: dayEnd,
      fromLocation: previousLocation,
      nextLocation: null,
      nextTitle: 'End of day',
    });
  }

  return gaps;
};

const recommendTasks = (tasks, gaps) => {
  const priorityScore = { High: 0, Medium: 1, Low: 2 };
  const openTasks = tasks.filter((task) => !task.complete);

  return gaps.map((gap) => {
    const options = openTasks
      .map((task) => {
        const travelToTask = travelService.getTravelTime(gap.fromLocation, task.location);
        const travelToNext = gap.nextLocation ? travelService.getTravelTime(task.location, gap.nextLocation) : 0;
        const totalTime = travelToTask + task.duration + travelToNext;
        const gapMinutes = gap.end - gap.start;
        const buffer = gapMinutes - totalTime;

        return {
          task,
          gap,
          gapMinutes,
          travelToTask,
          travelToNext,
          totalTime,
          buffer,
          fits: buffer >= 0,
          score: (priorityScore[task.priority] * 100) + (getDeadlineScore(task.deadline) * 20) + travelToTask + task.duration / 10,
        };
      })
      .filter((option) => option.fits)
      .sort((a, b) => a.score - b.score);

    return {
      ...gap,
      gapMinutes: gap.end - gap.start,
      suggestion: options[0] || null,
    };
  });
};

export default function App() {
  const [tasks, setTasks] = useState(seedTasks);
  const [weeklySchedule, setWeeklySchedule] = useState(seedWeeklySchedule);
  const [selectedDay, setSelectedDay] = useState(todayName);
  const [scheduleSetupComplete, setScheduleSetupComplete] = useState(false);
  const [calendarImportMessage, setCalendarImportMessage] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [planned, setPlanned] = useState(false);
  const [scenario, setScenario] = useState('normal');
  const [currentCoords, setCurrentCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState('Location not enabled yet');
  const [draft, setDraft] = useState({ title: '', day: todayName, duration: '', deadline: '', location: '', priority: 'Medium' });
  const [classDraft, setClassDraft] = useState({ title: '', startsAt: '', duration: '', location: '' });
  const activeDay = scheduleSetupComplete ? todayName : selectedDay;
  const activeSchedule = useMemo(() => [...(weeklySchedule[activeDay] || [])].sort((a, b) => a.startsAt - b.startsAt), [weeklySchedule, activeDay]);
  const activeTasks = useMemo(() => tasks.filter((task) => task.day === activeDay), [tasks, activeDay]);
  const scheduleGaps = useMemo(() => findScheduleGaps(activeSchedule), [activeSchedule]);
  const recommendations = useMemo(() => recommendTasks(activeTasks, scheduleGaps), [activeTasks, scheduleGaps]);
  const plan = useMemo(() => planDay(activeTasks, activeSchedule, scenario), [activeTasks, activeSchedule, scenario]);

  const requestCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('Location permission denied');
        Alert.alert('Location needed', 'Allow location while using the app so DayRoute can suggest nearby tasks.');
        return;
      }

      setLocationStatus('Finding your location...');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCurrentCoords(position.coords);
      setLocationStatus(`Using phone location · ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`);
    } catch {
      setLocationStatus('Could not get location');
      Alert.alert('Location unavailable', 'Turn on location services and try again.');
    }
  };

  const openDirections = async (destination) => {
    if (!destination || destination === 'No location set') {
      Alert.alert('Add a location first', 'This task needs a real destination before opening Google Maps.');
      return;
    }

    try {
      await Linking.openURL(getMapsUrl(destination, currentCoords));
    } catch {
      Alert.alert('Could not open maps', 'Try again after checking that your phone can open Google Maps links.');
    }
  };

  const addTask = () => {
    if (!draft.title.trim()) {
      Alert.alert('Add a task name', 'Enter the task you need to complete.');
      return;
    }

    const duration = Number(draft.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      Alert.alert('Check the task duration', 'Enter how many minutes this task should take.');
      return;
    }

    setTasks((items) => [
      ...items,
      {
        id: String(Date.now()),
        title: draft.title.trim(),
        day: draft.day,
        duration,
        deadline: draft.deadline.trim() || 'Flexible',
        location: draft.location.trim() || 'No location set',
        priority: draft.priority,
        complete: false,
      },
    ]);
    setDraft({ title: '', day: activeDay, duration: '', deadline: '', location: '', priority: 'Medium' });
    setShowTaskForm(false);
    setPlanned(false);
  };

  const toggleTask = (id) => setTasks((items) => items.map((task) => task.id === id ? { ...task, complete: !task.complete } : task));

  const removeTask = (id) => {
    const task = tasks.find((item) => item.id === id);
    Alert.alert('Remove task?', `Remove ${task?.title || 'this task'} from your plan?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setTasks((items) => items.filter((item) => item.id !== id));
          setPlanned(false);
        },
      },
    ]);
  };

  const removeFixedEvent = (day, id) => {
    const event = weeklySchedule[day]?.find((item) => item.id === id);
    Alert.alert('Remove fixed event?', `Remove ${event?.title || 'this event'} from ${day}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setWeeklySchedule((schedule) => ({
            ...schedule,
            [day]: (schedule[day] || []).filter((item) => item.id !== id),
          }));
          setPlanned(false);
        },
      },
    ]);
  };

  const selectDay = (day) => {
    setSelectedDay(day);
    setPlanned(false);
    setScenario('normal');
  };

  const finishScheduleSetup = () => {
    setScheduleSetupComplete(true);
    setSelectedDay(todayName);
    setDraft((current) => ({ ...current, day: todayName }));
    setPlanned(false);
    setScenario('normal');
  };

  const editWeeklySchedule = () => {
    setScheduleSetupComplete(false);
    setSelectedDay(todayName);
    setPlanned(false);
    setScenario('normal');
  };

  const addCommitment = () => {
    if (!classDraft.title.trim()) {
      Alert.alert('Add a fixed event', `Enter a class, meeting, shift, appointment, or commitment for ${selectedDay}.`);
      return;
    }

    const startsAt = parseClockTime(classDraft.startsAt);
    if (startsAt === null) {
      Alert.alert('Check the start time', 'Enter a time like 9:00 AM, 1:30 PM, or 14:30.');
      return;
    }

    const duration = Number(classDraft.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      Alert.alert('Check the duration', 'Enter how many minutes this fixed event takes, like 50 or 75.');
      return;
    }

    const newClass = {
      id: `${selectedDay}-${Date.now()}`,
      title: classDraft.title.trim(),
      startsAt,
      duration,
      location: classDraft.location.trim() || 'No location set',
      fixed: true,
    };

    const existingEvents = weeklySchedule[selectedDay] || [];
    if (hasScheduleConflict(existingEvents, newClass)) {
      Alert.alert('Schedule conflict', `${newClass.title} overlaps with another fixed event on ${selectedDay}. Pick a different time or duration.`);
      return;
    }

    setWeeklySchedule((schedule) => ({
      ...schedule,
      [selectedDay]: [
        ...(schedule[selectedDay] || []),
        newClass,
      ],
    }));
    setPlanned(false);
    setClassDraft({ title: '', startsAt: '', duration: '', location: '' });
  };

  const importDemoCalendar = () => {
    let importedCount = 0;

    setWeeklySchedule((schedule) => {
      const nextSchedule = { ...schedule };

      Object.entries(demoGoogleCalendarEvents).forEach(([day, events]) => {
        const existingEvents = nextSchedule[day] || [];
        const existingIds = new Set(existingEvents.map((event) => event.id));
        const newEvents = events.filter((event) => !existingIds.has(event.id) && !hasScheduleConflict(existingEvents, event));

        importedCount += newEvents.length;
        nextSchedule[day] = [...existingEvents, ...newEvents];
      });

      return nextSchedule;
    });

    const message = importedCount === 0 ? 'Google Calendar events already imported' : `Imported ${importedCount} fixed events`;
    setCalendarImportMessage(message);
    setPlanned(false);
    Alert.alert('Google Calendar demo import', message);
  };

  const startTaskFromGap = (gap) => {
    setDraft({
      title: '',
      day: activeDay,
      duration: '',
      deadline: `Before ${formatTime(gap.end)}`,
      location: gap.fromLocation || locations.current,
      priority: 'Medium',
    });
    setShowTaskForm(true);
  };

  const selectedDayIndex = weekdays.indexOf(selectedDay);
  const weeklyFixedCount = weekdays.reduce((sum, day) => sum + (weeklySchedule[day]?.length || 0), 0);

  const goToPreviousSetupDay = () => {
    selectDay(weekdays[(selectedDayIndex + weekdays.length - 1) % weekdays.length]);
  };

  const goToNextSetupDay = () => {
    selectDay(weekdays[(selectedDayIndex + 1) % weekdays.length]);
  };

  if (!scheduleSetupComplete) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>DayRoute</Text>
              <Text style={styles.caption}>One-time setup</Text>
            </View>
            <View style={styles.storagePill}><Text style={styles.storageText}>{weeklyFixedCount} fixed</Text></View>
          </View>

          <View style={styles.hero}>
            <Text style={styles.date}>SET UP YOUR WEEK</Text>
            <Text style={styles.title}>Add your fixed schedule once.</Text>
            <Text style={styles.subtitle}>Move through each day, add classes, shifts, meetings, or appointments, then DayRoute will automatically open today's plan using your phone's date.</Text>
          </View>

          <View style={styles.calendarImportCard}>
            <View style={styles.fill}>
              <Text style={styles.calendarTitle}>Start from calendar</Text>
              <Text style={styles.muted}>Demo import adds sample Google Calendar events to your week.</Text>
              {!!calendarImportMessage && <Text style={styles.importMessage}>{calendarImportMessage}</Text>}
            </View>
            <Pressable onPress={importDemoCalendar} style={styles.importButton}>
              <Text style={styles.importButtonText}>Import</Text>
            </Pressable>
          </View>

          <View style={styles.setupPanel}>
            <View style={styles.setupPanelTop}>
              <Pressable onPress={goToPreviousSetupDay} style={styles.dayNavButton}><Text style={styles.dayNavText}>Prev</Text></Pressable>
              <View style={styles.setupDayCenter}>
                <Text style={styles.kicker}>EDITING</Text>
                <Text style={styles.setupDayTitle}>{selectedDay}</Text>
                <Text style={styles.muted}>{weeklySchedule[selectedDay]?.length || 0} fixed event{(weeklySchedule[selectedDay]?.length || 0) === 1 ? '' : 's'}</Text>
              </View>
              <Pressable onPress={goToNextSetupDay} style={styles.dayNavButton}><Text style={styles.dayNavText}>Next</Text></Pressable>
            </View>

            <View style={styles.daySelector}>
              {weekdays.map((day) => (
                <Pressable key={day} onPress={() => selectDay(day)} style={[styles.dayButton, selectedDay === day && styles.dayButtonActive]}>
                  <Text style={[styles.dayButtonText, selectedDay === day && styles.dayButtonTextActive]}>{day.slice(0, 3)}</Text>
                  <Text style={[styles.dayCountText, selectedDay === day && styles.dayButtonTextActive]}>{weeklySchedule[day]?.length || 0}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.form}>
              <Text style={styles.formHint}>Add fixed event to {selectedDay}</Text>
              <Text style={styles.inputLabel}>Event name</Text>
              <TextInput value={classDraft.title} onChangeText={(title) => setClassDraft({ ...classDraft, title })} placeholder="Class, meeting, shift, or appointment" placeholderTextColor="#8b95a7" style={styles.input} />
              <View style={styles.formRow}>
                <View style={styles.half}>
                  <Text style={styles.inputLabel}>Start time</Text>
                  <TextInput value={classDraft.startsAt} onChangeText={(startsAt) => setClassDraft({ ...classDraft, startsAt })} placeholder="9:00 AM" placeholderTextColor="#8b95a7" style={styles.input} />
                  <View style={styles.periodRow}>
                    {['AM', 'PM'].map((period) => (
                      <Pressable key={period} onPress={() => setClassDraft({ ...classDraft, startsAt: applyClockPeriod(classDraft.startsAt, period) })} style={[styles.periodButton, classDraft.startsAt.toUpperCase().endsWith(period) && styles.periodButtonActive]}>
                        <Text style={[styles.periodText, classDraft.startsAt.toUpperCase().endsWith(period) && styles.periodTextActive]}>{period}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={styles.half}>
                  <Text style={styles.inputLabel}>Duration</Text>
                  <TextInput value={classDraft.duration} onChangeText={(duration) => setClassDraft({ ...classDraft, duration })} keyboardType="number-pad" placeholder="Minutes" placeholderTextColor="#8b95a7" style={styles.input} />
                </View>
              </View>
              <Text style={styles.inputLabel}>Location</Text>
              <TextInput value={classDraft.location} onChangeText={(location) => setClassDraft({ ...classDraft, location })} placeholder="Location" placeholderTextColor="#8b95a7" style={styles.input} />
              <Pressable onPress={addCommitment} style={styles.saveClassButton}><Text style={styles.addButtonText}>Save to {selectedDay}</Text></Pressable>
            </View>

            <View style={styles.taskList}>
              {(weeklySchedule[selectedDay] || []).length === 0 && (
                <View style={styles.emptyDayCard}>
                  <Text style={styles.emptyTitle}>{selectedDay} is open</Text>
                  <Text style={styles.muted}>Add a fixed event only if this day has something that cannot move.</Text>
                </View>
              )}
              {[...(weeklySchedule[selectedDay] || [])].sort((a, b) => a.startsAt - b.startsAt).map((item) => (
                <View key={item.id} style={styles.commitmentCard}>
                  <View style={styles.classIcon}><Text style={styles.classIconText}>F</Text></View>
                  <View style={styles.fill}>
                    <Text style={styles.taskTitle}>{item.title}</Text>
                    <Text style={styles.muted}>{formatTime(item.startsAt)} - {formatTime(item.startsAt + item.duration)} · {item.location}{item.source ? ` · ${item.source}` : ''}</Text>
                  </View>
                  <View style={styles.cardActions}>
                    <Text style={styles.fixedBadge}>FIXED</Text>
                    <Pressable onPress={() => removeFixedEvent(selectedDay, item.id)} style={styles.removeButton}>
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.finishSetupCard}>
            <Text style={styles.emptyTitle}>Ready for today's plan?</Text>
            <Text style={styles.muted}>DayRoute will use your phone's date, load {todayName}'s fixed events, find gaps, and recommend tasks that fit.</Text>
            <Pressable onPress={finishScheduleSetup} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Finish Setup</Text></Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>DayRoute</Text>
            <Text style={styles.caption}>Productivity x navigation</Text>
          </View>
          <View style={styles.storagePill}><Text style={styles.storageText}>{scheduleSetupComplete ? 'Today Plan' : 'Setup'}</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.date}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</Text>
          <Text style={styles.title}>{scheduleSetupComplete ? 'Your plan for today.' : 'Set your weekly rhythm.'}</Text>
          <Text style={styles.subtitle}>{scheduleSetupComplete ? `DayRoute automatically loaded ${todayName}'s fixed schedule and found what fits today.` : 'Add your fixed weekly events once. After setup, DayRoute automatically uses the real weekday.'}</Text>
        </View>

        <View style={styles.locationCard}>
          <Text style={styles.icon}>⌖</Text>
          <View style={styles.fill}>
            <Text style={styles.locationName}>{currentCoords ? 'Phone location active' : locations.current}</Text>
            <Text style={styles.muted}>{getDayLabel(activeDay, activeSchedule)} · {activeSchedule.length} fixed item{activeSchedule.length === 1 ? '' : 's'} · {scheduleGaps.length} open gap{scheduleGaps.length === 1 ? '' : 's'}</Text>
            <Text style={styles.place}>{locationStatus}</Text>
          </View>
          <Pressable onPress={requestCurrentLocation} style={styles.secondarySmall}>
            <Text style={styles.secondarySmallText}>{currentCoords ? 'Refresh' : 'Use Location'}</Text>
          </Pressable>
        </View>

        <View style={styles.calendarImportCard}>
          <View style={styles.fill}>
            <Text style={styles.calendarTitle}>Start from calendar</Text>
            <Text style={styles.muted}>Import demo Google Calendar events, or manually add your fixed weekly commitments below.</Text>
            {!!calendarImportMessage && <Text style={styles.importMessage}>{calendarImportMessage}</Text>}
          </View>
          <Pressable onPress={importDemoCalendar} style={styles.importButton}>
            <Text style={styles.importButtonText}>Import</Text>
          </Pressable>
        </View>

        {!scheduleSetupComplete && (
          <View style={styles.daySelector}>
            {weekdays.map((day) => (
              <Pressable key={day} onPress={() => selectDay(day)} style={[styles.dayButton, selectedDay === day && styles.dayButtonActive]}>
                <Text style={[styles.dayButtonText, selectedDay === day && styles.dayButtonTextActive]}>{day.slice(0, 3)}</Text>
                <Text style={[styles.dayCountText, selectedDay === day && styles.dayButtonTextActive]}>{weeklySchedule[day]?.length || 0}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {!scheduleSetupComplete && (
          <View style={styles.setupCard}>
            <Text style={styles.emptyTitle}>One-time weekly setup</Text>
            <Text style={styles.muted}>Add the fixed events that normally repeat in your week. After this, DayRoute opens straight to today's plan and chooses the right weekday automatically.</Text>
            <Pressable onPress={finishScheduleSetup} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Use Today's Schedule</Text></Pressable>
          </View>
        )}

        {scheduleSetupComplete && (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.kicker}>TASK MANAGEMENT</Text>
                <Text style={styles.sectionTitle}>Add or update tasks</Text>
              </View>
              <Pressable onPress={() => setShowTaskForm((value) => !value)} style={styles.primarySmall}><Text style={styles.primarySmallText}>{showTaskForm ? 'Close' : 'Add Task'}</Text></Pressable>
            </View>

            {showTaskForm && (
              <View style={styles.form}>
                <Text style={styles.formHint}>Add task for {draft.day}</Text>
                <Text style={styles.inputLabel}>Task name</Text>
                <TextInput value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} placeholder="Task name" placeholderTextColor="#8b95a7" style={styles.input} />

                <Text style={styles.inputLabel}>Task day</Text>
                <View style={styles.daySelector}>
                  {weekdays.map((day) => (
                    <Pressable key={day} onPress={() => setDraft({ ...draft, day })} style={[styles.dayButton, draft.day === day && styles.dayButtonActive]}>
                      <Text style={[styles.dayButtonText, draft.day === day && styles.dayButtonTextActive]}>{day.slice(0, 3)}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.formRow}>
                  <View style={styles.half}>
                    <Text style={styles.inputLabel}>Duration</Text>
                    <TextInput value={draft.duration} onChangeText={(duration) => setDraft({ ...draft, duration })} keyboardType="number-pad" placeholder="Minutes" placeholderTextColor="#8b95a7" style={styles.input} />
                  </View>
                  <View style={styles.half}>
                    <Text style={styles.inputLabel}>Deadline</Text>
                    <TextInput value={draft.deadline} onChangeText={(deadline) => setDraft({ ...draft, deadline })} placeholder="Today 6:00 PM" placeholderTextColor="#8b95a7" style={styles.input} />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Location</Text>
                <TextInput value={draft.location} onChangeText={(location) => setDraft({ ...draft, location })} placeholder="Where you will do it" placeholderTextColor="#8b95a7" style={styles.input} />

                <Text style={styles.inputLabel}>Priority</Text>
                <View style={styles.priorityRow}>
                  {['High', 'Medium', 'Low'].map((priority) => (
                    <Pressable key={priority} onPress={() => setDraft({ ...draft, priority })} style={[styles.priority, draft.priority === priority && styles.priorityActive]}>
                      <Text style={[styles.priorityText, draft.priority === priority && styles.priorityTextActive]}>{priority}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={addTask} style={styles.addButton}><Text style={styles.addButtonText}>Save Task</Text></Pressable>
                </View>
              </View>
            )}

            <View style={styles.sectionHeaderCompact}>
              <View>
                <Text style={styles.kicker}>TODAY'S TASKS</Text>
                <Text style={styles.muted}>{activeTasks.length} task{activeTasks.length === 1 ? '' : 's'} for {activeDay}</Text>
              </View>
              <Pressable onPress={() => setPlanned(true)} style={styles.secondarySmall}><Text style={styles.secondarySmallText}>Plan My Day</Text></Pressable>
            </View>

            <View style={styles.taskList}>
              {activeTasks.length === 0 && (
                <View style={styles.emptyDayCard}>
                  <Text style={styles.emptyTitle}>No tasks for today</Text>
                  <Text style={styles.muted}>Tap Add Task to add mandatory tasks, groceries, assignments, calls, or errands before planning your day.</Text>
                </View>
              )}
              {activeTasks.map((task) => (
                <View key={task.id} style={[styles.taskCard, task.complete && styles.completeTask]}>
                  <Pressable onPress={() => toggleTask(task.id)} style={[styles.checkbox, task.complete && styles.checked]}>
                    <Text style={styles.checkmark}>{task.complete ? '✓' : ''}</Text>
                  </Pressable>
                  <View style={styles.fill}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    <Text style={styles.muted}>{task.duration} min · {task.deadline}</Text>
                    <Text style={styles.place}>⌖ {task.location}</Text>
                  </View>
                  <View style={styles.cardActions}>
                    <View style={[styles.tag, styles[`tag${task.priority}`]]}><Text style={styles.tagText}>{task.priority}</Text></View>
                    <Pressable onPress={() => removeTask(task.id)} style={styles.removeButton}>
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.kicker}>FIXED SCHEDULE</Text>
            <Text style={styles.sectionTitle}>{activeDay} fixed events</Text>
          </View>
          {scheduleSetupComplete && (
            <Pressable onPress={editWeeklySchedule} style={styles.secondarySmall}><Text style={styles.secondarySmallText}>Edit Week</Text></Pressable>
          )}
        </View>

        <View style={styles.taskList}>
          {activeSchedule.length === 0 && (
            <View style={styles.emptyDayCard}>
              <Text style={styles.emptyTitle}>No fixed events</Text>
              <Text style={styles.muted}>{scheduleSetupComplete ? 'Today is open for tasks, errands, appointments, and recovery time.' : 'This day is open. Add fixed events here if this weekday has any.'}</Text>
            </View>
          )}
          {activeSchedule.map((item) => (
            <View key={item.id} style={styles.commitmentCard}>
              <View style={styles.classIcon}><Text style={styles.classIconText}>F</Text></View>
              <View style={styles.fill}>
                <Text style={styles.taskTitle}>{item.title}</Text>
                <Text style={styles.muted}>{formatTime(item.startsAt)} - {formatTime(item.startsAt + item.duration)} · {item.location}{item.source ? ` · ${item.source}` : ''}</Text>
              </View>
              <View style={styles.cardActions}>
                <Text style={styles.fixedBadge}>FIXED</Text>
                <Pressable onPress={() => removeFixedEvent(activeDay, item.id)} style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        {scheduleSetupComplete && (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.kicker}>RECOMMENDATIONS</Text>
                <Text style={styles.sectionTitle}>What fits today</Text>
              </View>
            </View>

            <View style={styles.recommendationList}>
              {recommendations.map((gap) => (
                <View key={gap.id} style={styles.recommendationCard}>
                  <View style={styles.recommendationTop}>
                    <View>
                      <Text style={styles.gapTime}>{formatTime(gap.start)} - {formatTime(gap.end)}</Text>
                      <Text style={styles.muted}>{gap.gapMinutes} min open · before {gap.nextTitle}</Text>
                    </View>
                    <Text style={styles.gapBadge}>GAP</Text>
                  </View>

                  {gap.suggestion ? (
                    <View style={styles.suggestionBox}>
                      <Text style={styles.suggestionTitle}>{gap.suggestion.task.title}</Text>
                      <Text style={styles.muted}>{gap.suggestion.task.location} · {gap.suggestion.task.priority} priority · {gap.suggestion.task.deadline}</Text>
                      <View style={styles.timeBreakdown}>
                        <Text style={styles.breakdownText}>{gap.suggestion.travelToTask}m there</Text>
                        <Text style={styles.breakdownText}>{gap.suggestion.task.duration}m task</Text>
                        <Text style={styles.breakdownText}>{gap.suggestion.travelToNext}m next</Text>
                      </View>
                      <Text style={styles.fitText}>Needs {gap.suggestion.totalTime} min · leaves {gap.suggestion.buffer} min buffer</Text>
                      <Pressable onPress={() => openDirections(gap.suggestion.task.location)} style={styles.suggestionAction}><Text style={styles.suggestionActionText}>Open Google Maps</Text></Pressable>
                    </View>
                  ) : (
                    <View style={styles.suggestionBox}>
                      <Text style={styles.suggestionTitle}>You're free in this window</Text>
                      <Text style={styles.muted}>Add a task for {activeDay}, then DayRoute will rank it against your priorities and travel time.</Text>
                      <Pressable onPress={() => startTaskFromGap(gap)} style={styles.suggestionAction}><Text style={styles.suggestionActionText}>Add task for this gap</Text></Pressable>
                    </View>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.planPanel}>
              <View style={styles.panelTop}>
                <View>
                  <Text style={styles.kicker}>PLANNING ENGINE</Text>
                  <Text style={styles.sectionTitle}>{scenario === 'delay' ? 'Replanned around change' : `Today's plan`}</Text>
                </View>
                <Text style={styles.planBadge}>{planned ? 'OPTIMIZED' : 'DRAFT'}</Text>
              </View>

              {!planned ? (
                <View style={styles.emptyPlan}>
                  <Text style={styles.emptyTitle}>Ready to coordinate today</Text>
                  <Text style={styles.mutedCenter}>The local engine will sort by priority, protect fixed commitments, and use mock travel times.</Text>
                  <Pressable onPress={() => setPlanned(true)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Generate Plan</Text></Pressable>
                </View>
              ) : (
                <View style={styles.timeline}>
                  {scenario === 'delay' && (
                    <View style={styles.alert}>
                      <Text style={styles.alertIcon}>!</Text>
                      <View style={styles.fill}>
                        <Text style={styles.alertTitle}>Something changed</Text>
                        <Text style={styles.alertText}>A high-priority task took longer, so DayRoute rebuilt the rest of the timeline around fixed events.</Text>
                      </View>
                    </View>
                  )}

                  {plan.route.map((item, index) => (
                    <View key={`${item.id}-${index}`} style={styles.routeRow}>
                      <View style={styles.timeCol}>
                        <Text style={styles.time}>{formatTime(item.start)}</Text>
                        <Text style={styles.endTime}>{formatTime(item.end)}</Text>
                      </View>
                      <View style={styles.rail}>
                        <View style={[styles.dot, item.kind === 'commitment' && styles.dotCommitment, item.moved && styles.dotMoved]} />
                        {index < plan.route.length - 1 && <View style={styles.line} />}
                      </View>
                      <View style={[styles.routeCard, item.moved && styles.movedCard]}>
                        <Text style={styles.routeTitle}>{item.title}</Text>
                        <Text style={styles.muted}>{item.location}{item.travel ? ` · ${item.travel} min travel` : ''}</Text>
                      </View>
                    </View>
                  ))}

                  <View style={styles.replanGrid}>
                    <Pressable onPress={() => setScenario('delay')} style={[styles.replanButton, scenario === 'delay' && styles.replanActive]}><Text style={styles.replanText}>Task took longer</Text></Pressable>
                    <Pressable onPress={() => setScenario('normal')} style={styles.replanButton}><Text style={styles.replanText}>Restore plan</Text></Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.summary}>
              <Text style={styles.trophy}>🏆</Text>
              <Text style={styles.summaryTitle}>Day Optimized</Text>
              <View style={styles.summaryRow}><Text style={styles.summaryMetric}>{plan.stats.completed}</Text><Text style={styles.summaryText}>tasks completed</Text></View>
              <View style={styles.summaryRow}><Text style={styles.summaryMetric}>{plan.stats.travelTotal}</Text><Text style={styles.summaryText}>min travel time</Text></View>
              <View style={styles.summaryRow}><Text style={styles.summaryMetric}>{plan.stats.buffer}</Text><Text style={styles.summaryText}>min buffer saved</Text></View>
              <View style={styles.summaryRow}><Text style={styles.summaryMetric}>{plan.stats.missed}</Text><Text style={styles.summaryText}>commitments missed</Text></View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f7fb' },
  container: { paddingHorizontal: 18, paddingBottom: 42 },
  header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#07152f', fontSize: 26, fontWeight: '900' },
  caption: { color: '#5e6f86', fontSize: 12, marginTop: 2, fontWeight: '700' },
  storagePill: { backgroundColor: '#07152f', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  storageText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  hero: { paddingVertical: 22 },
  date: { color: '#118052', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#07152f', fontSize: 36, lineHeight: 40, fontWeight: '900', marginTop: 8 },
  subtitle: { color: '#526176', fontSize: 14, lineHeight: 21, marginTop: 10, fontWeight: '600' },
  locationCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d9e4ef', borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#10233f', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  calendarImportCard: { marginTop: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d9e4ef', borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#10233f', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  calendarTitle: { color: '#07152f', fontSize: 16, fontWeight: '900' },
  importMessage: { color: '#0f7a3b', fontSize: 12, lineHeight: 17, fontWeight: '900', marginTop: 4 },
  importButton: { backgroundColor: '#1677ff', borderRadius: 9, height: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  importButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  icon: { color: '#1677ff', fontSize: 24 },
  daySelector: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dayButton: { flex: 1, height: 38, borderRadius: 9, borderWidth: 1, borderColor: '#d4ddea', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dayButtonActive: { backgroundColor: '#07152f', borderColor: '#07152f' },
  dayButtonText: { color: '#516177', fontSize: 11, fontWeight: '900' },
  dayCountText: { color: '#7a8798', fontSize: 9, fontWeight: '900', marginTop: 1 },
  dayButtonTextActive: { color: '#fff' },
  fill: { flex: 1 },
  locationName: { color: '#07152f', fontSize: 16, fontWeight: '900' },
  muted: { color: '#66768d', fontSize: 12, lineHeight: 17 },
  mutedCenter: { color: '#66768d', fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 270 },
  sectionHeader: { marginTop: 24, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  sectionHeaderCompact: { marginTop: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  kicker: { color: '#0f7a3b', fontSize: 10, letterSpacing: 1, fontWeight: '900', marginBottom: 5 },
  sectionTitle: { color: '#07152f', fontSize: 20, fontWeight: '900' },
  primarySmall: { backgroundColor: '#1677ff', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11 },
  primarySmallText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  secondarySmall: { backgroundColor: '#eef4ff', borderColor: '#cfe0ff', borderWidth: 1, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 10 },
  secondarySmallText: { color: '#174ea6', fontSize: 12, fontWeight: '900' },
  setupCard: { marginTop: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d9e4ef', borderRadius: 10, padding: 15, gap: 10 },
  setupPanel: { marginTop: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d9e4ef', borderRadius: 12, padding: 14, gap: 12, shadowColor: '#10233f', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  setupPanelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  setupDayCenter: { flex: 1, alignItems: 'center' },
  setupDayTitle: { color: '#07152f', fontSize: 25, fontWeight: '900' },
  dayNavButton: { backgroundColor: '#eef4ff', borderColor: '#cfe0ff', borderWidth: 1, borderRadius: 9, height: 40, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  dayNavText: { color: '#174ea6', fontSize: 12, fontWeight: '900' },
  finishSetupCard: { marginTop: 14, backgroundColor: '#fff8f1', borderColor: '#fdba74', borderWidth: 1, borderRadius: 10, padding: 15, gap: 10 },
  form: { backgroundColor: '#edf9f1', borderWidth: 1, borderColor: '#b9e4c8', borderRadius: 10, padding: 13, gap: 10 },
  formHint: { color: '#0f7a3b', fontSize: 12, fontWeight: '900' },
  inputLabel: { color: '#314158', fontSize: 11, fontWeight: '900', marginBottom: -4 },
  input: { backgroundColor: '#fff', borderColor: '#d4ddea', borderWidth: 1, borderRadius: 9, height: 44, paddingHorizontal: 12, color: '#10233f', fontSize: 13 },
  formRow: { flexDirection: 'row', gap: 9 },
  half: { flex: 1 },
  periodRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  periodButton: { flex: 1, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#b8c6d9', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  periodButtonActive: { backgroundColor: '#07152f', borderColor: '#07152f' },
  periodText: { color: '#42536a', fontSize: 11, fontWeight: '900' },
  periodTextActive: { color: '#fff' },
  priorityRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  priority: { borderColor: '#b8c6d9', borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, height: 36, justifyContent: 'center', backgroundColor: '#fff' },
  priorityActive: { backgroundColor: '#07152f', borderColor: '#07152f' },
  priorityText: { color: '#42536a', fontSize: 12, fontWeight: '800' },
  priorityTextActive: { color: '#fff' },
  addButton: { backgroundColor: '#118052', borderRadius: 9, paddingHorizontal: 14, height: 36, justifyContent: 'center' },
  saveClassButton: { backgroundColor: '#118052', borderRadius: 9, height: 44, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  locationInput: { flex: 1, minWidth: 170 },
  taskList: { marginTop: 12, gap: 8 },
  taskCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dfe6ef', borderRadius: 11, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, shadowColor: '#10233f', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  commitmentCard: { backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#cfe0ff', borderRadius: 11, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  emptyDayCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dfe6ef', borderRadius: 11, padding: 15, gap: 5 },
  recommendationList: { gap: 10 },
  recommendationCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d9e4ef', borderRadius: 12, padding: 14, gap: 12, shadowColor: '#10233f', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  recommendationTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  gapTime: { color: '#10233f', fontSize: 15, fontWeight: '900' },
  gapBadge: { color: '#118052', backgroundColor: '#dcfce7', borderRadius: 7, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6, fontSize: 10, fontWeight: '900' },
  suggestionBox: { backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#e1e9f5', borderRadius: 10, padding: 12, gap: 6 },
  suggestionTitle: { color: '#071936', fontSize: 15, fontWeight: '900' },
  suggestionAction: { marginTop: 5, alignSelf: 'flex-start', backgroundColor: '#1677ff', borderRadius: 9, paddingHorizontal: 13, paddingVertical: 10 },
  suggestionActionText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  timeBreakdown: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginTop: 3 },
  breakdownText: { color: '#174ea6', backgroundColor: '#e8f1ff', borderRadius: 6, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: '800' },
  fitText: { color: '#0f7a3b', fontSize: 12, fontWeight: '900', marginTop: 2 },
  classIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  classIconText: { color: '#174ea6', fontSize: 12, fontWeight: '900' },
  fixedBadge: { color: '#174ea6', fontSize: 10, fontWeight: '900' },
  cardActions: { alignItems: 'flex-end', gap: 8 },
  removeButton: { backgroundColor: '#fff1f2', borderColor: '#fecdd3', borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  removeButtonText: { color: '#be123c', fontSize: 10, fontWeight: '900' },
  completeTask: { opacity: 0.55 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#9aa8bb', alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '900' },
  taskTitle: { color: '#10233f', fontSize: 14, fontWeight: '900' },
  place: { color: '#375f92', fontSize: 11, marginTop: 3 },
  tag: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  tagHigh: { backgroundColor: '#fee2e2' },
  tagMedium: { backgroundColor: '#fef3c7' },
  tagLow: { backgroundColor: '#dcfce7' },
  tagText: { color: '#21324a', fontSize: 10, fontWeight: '900' },
  planPanel: { marginTop: 24, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cfe0ff', borderRadius: 12, overflow: 'hidden', shadowColor: '#10233f', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  panelTop: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#e6edf8', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  planBadge: { color: '#174ea6', fontSize: 10, fontWeight: '900' },
  emptyPlan: { alignItems: 'center', padding: 30, gap: 12 },
  emptyTitle: { color: '#10233f', fontSize: 16, fontWeight: '900' },
  primaryButton: { backgroundColor: '#1677ff', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 13, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  timeline: { padding: 15 },
  alert: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: 'row', gap: 10, marginBottom: 13 },
  alertIcon: { width: 22, height: 22, borderRadius: 11, color: '#fff', backgroundColor: '#f97316', textAlign: 'center', fontWeight: '900', lineHeight: 22 },
  alertTitle: { color: '#9a3412', fontWeight: '900', fontSize: 13 },
  alertText: { color: '#9a6a42', fontSize: 12, marginTop: 2 },
  routeRow: { flexDirection: 'row', minHeight: 68 },
  timeCol: { width: 48, alignItems: 'flex-end' },
  time: { color: '#071936', fontSize: 14, fontWeight: '900' },
  endTime: { color: '#7a8798', fontSize: 10, marginTop: 3 },
  rail: { width: 28, alignItems: 'center' },
  dot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#22c55e', borderWidth: 3, borderColor: '#ddf8e6' },
  dotCommitment: { backgroundColor: '#0ea5e9', borderColor: '#d8f3ff' },
  dotMoved: { backgroundColor: '#f59e0b', borderColor: '#fff2c7' },
  line: { width: 2, flex: 1, backgroundColor: '#d4deec' },
  routeCard: { flex: 1, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#e1e9f5', borderRadius: 10, padding: 11, marginBottom: 10 },
  movedCard: { backgroundColor: '#fffbeb', borderColor: '#f5d384', borderStyle: 'dashed' },
  routeTitle: { color: '#10233f', fontSize: 14, fontWeight: '900', marginBottom: 3 },
  replanGrid: { flexDirection: 'row', gap: 9, marginTop: 4 },
  replanButton: { flex: 1, backgroundColor: '#eef4ff', borderWidth: 1, borderColor: '#cfe0ff', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  replanActive: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  replanText: { color: '#174ea6', fontSize: 12, fontWeight: '900' },
  summary: { marginTop: 24, backgroundColor: '#fff8f1', borderColor: '#fdba74', borderWidth: 1, borderRadius: 12, padding: 16, alignItems: 'center', shadowColor: '#9a3412', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  trophy: { fontSize: 27 },
  summaryTitle: { color: '#10233f', fontSize: 18, fontWeight: '900', marginTop: 6, marginBottom: 12 },
  summaryRow: { width: '100%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#f4dac2', borderRadius: 9, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 },
  summaryMetric: { color: '#0f7a3b', fontSize: 16, fontWeight: '900', width: 34, textAlign: 'right' },
  summaryText: { color: '#314158', fontSize: 13, fontWeight: '700' },
});
