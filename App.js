import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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

const dayStart = 14 * 60 + 5;
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const classDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const todayName = weekdays[new Date().getDay()];

const seedTasks = [
  { id: 'architecture', title: 'Architecture HW', duration: 45, deadline: 'Today 3:00 PM', location: locations.library, priority: 'High', complete: false },
  { id: 'lunch', title: 'Lunch', duration: 20, deadline: 'Flexible', location: locations.nearby, priority: 'Medium', complete: false },
  { id: 'groceries', title: 'Groceries', duration: 40, deadline: 'Today 6:00 PM', location: locations.heb, priority: 'Low', complete: false },
  { id: 'cv', title: 'CV Assignment', duration: 90, deadline: 'Tomorrow', location: locations.home, priority: 'Medium', complete: false },
];

const seedWeeklySchedule = {
  Sunday: [],
  Monday: [
    { id: 'mon-data-structures', title: 'Data Structures Class', startsAt: 9 * 60, duration: 75, location: locations.ingram, fixed: true },
    { id: 'mon-calculus', title: 'Calculus', startsAt: 13 * 60, duration: 75, location: locations.ingram, fixed: true },
  ],
  Tuesday: [
    { id: 'tue-ai', title: 'AI Lecture', startsAt: 11 * 60, duration: 75, location: locations.library, fixed: true },
    { id: 'tue-lab', title: 'Project Lab', startsAt: 15 * 60 + 30, duration: 60, location: locations.ingram, fixed: true },
  ],
  Wednesday: [
    { id: 'wed-data-structures', title: 'Data Structures Class', startsAt: 9 * 60, duration: 75, location: locations.ingram, fixed: true },
    { id: 'wed-calculus', title: 'Calculus', startsAt: 13 * 60, duration: 75, location: locations.ingram, fixed: true },
  ],
  Thursday: [
    { id: 'thu-ai', title: 'AI Lecture', startsAt: 11 * 60, duration: 75, location: locations.library, fixed: true },
  ],
  Friday: [
    { id: 'fri-seminar', title: 'Team Seminar', startsAt: 10 * 60, duration: 50, location: locations.library, fixed: true },
  ],
  Saturday: [],
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
  if (!match) return 15 * 60 + 30;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3]?.toLowerCase();

  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return hour * 60 + minute;
};

const travelService = {
  getTravelTime(from, to) {
    if (from === to) return 0;
    return travelTimes[`${from}->${to}`] ?? travelTimes[`${to}->${from}`] ?? 10;
  },
};

function planDay(tasks, commitments, scenario) {
  const openTasks = tasks.filter((task) => !task.complete);
  const ordered = [...openTasks].sort((a, b) => {
    const score = { High: 0, Medium: 1, Low: 2 };
    return score[a.priority] - score[b.priority];
  });

  const sortedCommitments = [...commitments].sort((a, b) => a.startsAt - b.startsAt);
  const classCommitment = sortedCommitments[0];
  const homework = ordered.find((task) => task.id === 'architecture');
  const lunch = ordered.find((task) => task.id === 'lunch');
  const afterClass = ordered.filter((task) => !['architecture', 'lunch'].includes(task.id));
  const homeworkDuration = homework ? homework.duration + (scenario === 'delay' ? 20 : 0) : 0;
  const route = [];
  let cursor = dayStart;
  let place = locations.current;

  if (homework) {
    route.push({ id: homework.id, kind: 'task', title: homework.title, start: cursor, end: cursor + homeworkDuration, location: homework.location, travel: 0, priority: homework.priority });
    cursor += homeworkDuration;
    place = homework.location;
  }

  if (!classCommitment) {
    afterClass.forEach((task) => {
      const travel = travelService.getTravelTime(place, task.location);
      cursor += travel;
      route.push({ id: task.id, kind: 'task', title: task.title, start: cursor, end: cursor + task.duration, location: task.location, travel, priority: task.priority });
      cursor += task.duration;
      place = task.location;
    });

    return {
      route,
      stats: {
        completed: tasks.filter((task) => task.complete).length,
        travelTotal: route.reduce((sum, item) => sum + (item.travel || 0), 0),
        buffer: 0,
        missed: 0,
      },
    };
  }

  const addLunchBeforeClass = lunch && scenario !== 'delay' && cursor + travelService.getTravelTime(place, lunch.location) + lunch.duration + travelService.getTravelTime(lunch.location, classCommitment.location) <= classCommitment.startsAt;

  if (addLunchBeforeClass) {
    const travel = travelService.getTravelTime(place, lunch.location);
    cursor += travel;
    route.push({ id: lunch.id, kind: 'task', title: lunch.title, start: cursor, end: cursor + lunch.duration, location: lunch.location, travel, priority: lunch.priority });
    cursor += lunch.duration;
    place = lunch.location;
  }

  const classTravel = travelService.getTravelTime(place, classCommitment.location);
  route.push({ id: 'walk-class', kind: 'travel', title: `Walk to ${classCommitment.location.split(' ')[0]}`, start: cursor, end: cursor + classTravel, location: classCommitment.location, travel: classTravel });
  route.push({ ...classCommitment, kind: 'commitment', start: classCommitment.startsAt, end: classCommitment.startsAt + classCommitment.duration, travel: classTravel });
  cursor = classCommitment.startsAt + classCommitment.duration;
  place = classCommitment.location;

  if (lunch && !addLunchBeforeClass) {
    const travel = travelService.getTravelTime(place, lunch.location);
    cursor += travel;
    route.push({ id: lunch.id, kind: 'task', title: lunch.title, start: cursor, end: cursor + lunch.duration, location: lunch.location, travel, priority: lunch.priority, moved: true });
    cursor += lunch.duration;
    place = lunch.location;
  }

  afterClass.slice(0, 1).forEach((task) => {
    const travel = travelService.getTravelTime(place, task.location);
    cursor += travel;
    route.push({ id: task.id, kind: 'task', title: task.title, start: cursor, end: cursor + task.duration, location: task.location, travel, priority: task.priority });
  });

  const travelTotal = route.reduce((sum, item) => sum + (item.travel || 0), 0);
  const classArrival = route.find((item) => item.id === 'walk-class')?.end ?? classCommitment.startsAt;
  const buffer = Math.max(0, classCommitment.startsAt - classArrival);

  return {
    route,
    stats: {
      completed: tasks.filter((task) => task.complete).length,
      travelTotal,
      buffer,
      missed: buffer >= 0 ? 0 : 1,
    },
  };
}

const getDayLabel = (day) => classDays.includes(day) ? `${day} classes` : `${day} is open`;

export default function App() {
  const [tasks, setTasks] = useState(seedTasks);
  const [weeklySchedule, setWeeklySchedule] = useState(seedWeeklySchedule);
  const [selectedDay, setSelectedDay] = useState(todayName);
  const [planned, setPlanned] = useState(false);
  const [scenario, setScenario] = useState('normal');
  const [draft, setDraft] = useState({ title: '', duration: '30', deadline: 'Flexible', location: locations.library, priority: 'Medium' });
  const [classDraft, setClassDraft] = useState({ title: '', startsAt: '3:30 PM', duration: '75', location: locations.ingram });
  const todaySchedule = useMemo(() => [...(weeklySchedule[selectedDay] || [])].sort((a, b) => a.startsAt - b.startsAt), [weeklySchedule, selectedDay]);
  const plan = useMemo(() => planDay(tasks, todaySchedule, scenario), [tasks, todaySchedule, scenario]);

  const addTask = () => {
    if (!draft.title.trim()) return;
    setTasks((items) => [
      ...items,
      {
        id: String(Date.now()),
        title: draft.title.trim(),
        duration: Number(draft.duration) || 30,
        deadline: draft.deadline.trim() || 'Flexible',
        location: draft.location.trim() || locations.library,
        priority: draft.priority,
        complete: false,
      },
    ]);
    setDraft({ title: '', duration: '30', deadline: 'Flexible', location: locations.library, priority: 'Medium' });
  };

  const toggleTask = (id) => setTasks((items) => items.map((task) => task.id === id ? { ...task, complete: !task.complete } : task));

  const addCommitment = () => {
    if (!classDraft.title.trim()) return;
    setWeeklySchedule((schedule) => ({
      ...schedule,
      [selectedDay]: [
        ...(schedule[selectedDay] || []),
        {
        id: String(Date.now()),
        title: classDraft.title.trim(),
        startsAt: parseClockTime(classDraft.startsAt),
        duration: Number(classDraft.duration) || 60,
        location: classDraft.location.trim() || locations.ingram,
        fixed: true,
        },
      ],
    }));
    setClassDraft({ title: '', startsAt: '3:30 PM', duration: '75', location: locations.ingram });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>DayRoute</Text>
            <Text style={styles.caption}>Productivity x navigation</Text>
          </View>
          <View style={styles.storagePill}><Text style={styles.storageText}>Local MVP</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.date}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</Text>
          <Text style={styles.title}>{selectedDay === todayName ? 'Plan today.' : `Preview ${selectedDay}.`}</Text>
          <Text style={styles.subtitle}>DayRoute loads the right fixed schedule, finds your open time, and protects your next class.</Text>
        </View>

        <View style={styles.locationCard}>
          <Text style={styles.icon}>⌖</Text>
          <View style={styles.fill}>
            <Text style={styles.locationName}>{locations.current}</Text>
            <Text style={styles.muted}>{getDayLabel(selectedDay)} · {todaySchedule.length} fixed item{todaySchedule.length === 1 ? '' : 's'}</Text>
          </View>
        </View>

        <View style={styles.daySelector}>
          {weekdays.map((day) => (
            <Pressable key={day} onPress={() => setSelectedDay(day)} style={[styles.dayButton, selectedDay === day && styles.dayButtonActive]}>
              <Text style={[styles.dayButtonText, selectedDay === day && styles.dayButtonTextActive]}>{day.slice(0, 3)}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.kicker}>TASK MANAGEMENT</Text>
            <Text style={styles.sectionTitle}>Add or update tasks</Text>
          </View>
          <Pressable onPress={() => setPlanned(true)} style={styles.primarySmall}><Text style={styles.primarySmallText}>Plan My Day</Text></Pressable>
        </View>

        <View style={styles.form}>
          <TextInput value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} placeholder="Task name" placeholderTextColor="#8b95a7" style={styles.input} />
          <View style={styles.formRow}>
            <TextInput value={draft.duration} onChangeText={(duration) => setDraft({ ...draft, duration })} keyboardType="number-pad" placeholder="Duration" placeholderTextColor="#8b95a7" style={[styles.input, styles.half]} />
            <TextInput value={draft.deadline} onChangeText={(deadline) => setDraft({ ...draft, deadline })} placeholder="Deadline" placeholderTextColor="#8b95a7" style={[styles.input, styles.half]} />
          </View>
          <TextInput value={draft.location} onChangeText={(location) => setDraft({ ...draft, location })} placeholder="Location" placeholderTextColor="#8b95a7" style={styles.input} />
          <View style={styles.priorityRow}>
            {['High', 'Medium', 'Low'].map((priority) => (
              <Pressable key={priority} onPress={() => setDraft({ ...draft, priority })} style={[styles.priority, draft.priority === priority && styles.priorityActive]}>
                <Text style={[styles.priorityText, draft.priority === priority && styles.priorityTextActive]}>{priority}</Text>
              </Pressable>
            ))}
            <Pressable onPress={addTask} style={styles.addButton}><Text style={styles.addButtonText}>Save Task</Text></Pressable>
          </View>
        </View>

        <View style={styles.taskList}>
          {tasks.map((task) => (
            <Pressable key={task.id} onPress={() => toggleTask(task.id)} style={[styles.taskCard, task.complete && styles.completeTask]}>
              <View style={[styles.checkbox, task.complete && styles.checked]}><Text style={styles.checkmark}>{task.complete ? '✓' : ''}</Text></View>
              <View style={styles.fill}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                <Text style={styles.muted}>{task.duration} min · {task.deadline}</Text>
                <Text style={styles.place}>⌖ {task.location}</Text>
              </View>
              <View style={[styles.tag, styles[`tag${task.priority}`]]}><Text style={styles.tagText}>{task.priority}</Text></View>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.kicker}>FIXED SCHEDULE</Text>
            <Text style={styles.sectionTitle}>{selectedDay} classes</Text>
          </View>
        </View>

        <View style={styles.form}>
          <TextInput value={classDraft.title} onChangeText={(title) => setClassDraft({ ...classDraft, title })} placeholder="Class name" placeholderTextColor="#8b95a7" style={styles.input} />
          <View style={styles.formRow}>
            <TextInput value={classDraft.startsAt} onChangeText={(startsAt) => setClassDraft({ ...classDraft, startsAt })} placeholder="Start time" placeholderTextColor="#8b95a7" style={[styles.input, styles.half]} />
            <TextInput value={classDraft.duration} onChangeText={(duration) => setClassDraft({ ...classDraft, duration })} keyboardType="number-pad" placeholder="Minutes" placeholderTextColor="#8b95a7" style={[styles.input, styles.half]} />
          </View>
          <View style={styles.priorityRow}>
            <TextInput value={classDraft.location} onChangeText={(location) => setClassDraft({ ...classDraft, location })} placeholder="Location" placeholderTextColor="#8b95a7" style={[styles.input, styles.locationInput]} />
            <Pressable onPress={addCommitment} style={styles.addButton}><Text style={styles.addButtonText}>Save Class</Text></Pressable>
          </View>
        </View>

        <View style={styles.taskList}>
          {todaySchedule.length === 0 && (
            <View style={styles.emptyDayCard}>
              <Text style={styles.emptyTitle}>No fixed classes</Text>
              <Text style={styles.muted}>This day is open for tasks, errands, studying, and recovery time.</Text>
            </View>
          )}
          {todaySchedule.map((item) => (
            <View key={item.id} style={styles.commitmentCard}>
              <View style={styles.classIcon}><Text style={styles.classIconText}>C</Text></View>
              <View style={styles.fill}>
                <Text style={styles.taskTitle}>{item.title}</Text>
                <Text style={styles.muted}>{formatTime(item.startsAt)} - {formatTime(item.startsAt + item.duration)} · {item.location}</Text>
              </View>
              <Text style={styles.fixedBadge}>FIXED</Text>
            </View>
          ))}
        </View>

        <View style={styles.planPanel}>
          <View style={styles.panelTop}>
            <View>
              <Text style={styles.kicker}>PLANNING ENGINE</Text>
              <Text style={styles.sectionTitle}>{scenario === 'delay' ? 'Replanned around change' : 'Your optimal plan'}</Text>
            </View>
            <Text style={styles.planBadge}>{planned ? 'OPTIMIZED' : 'DRAFT'}</Text>
          </View>

          {!planned ? (
            <View style={styles.emptyPlan}>
              <Text style={styles.emptyTitle}>Ready to coordinate your day</Text>
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
                    <Text style={styles.alertText}>Architecture HW took longer, so lunch moved after class.</Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f8fb' },
  container: { paddingHorizontal: 18, paddingBottom: 36 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#061a40', fontSize: 24, fontWeight: '900' },
  caption: { color: '#50617a', fontSize: 12, marginTop: 2 },
  storagePill: { backgroundColor: '#dbeafe', borderColor: '#a9c8fb', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  storageText: { color: '#174ea6', fontSize: 11, fontWeight: '800' },
  hero: { paddingVertical: 18 },
  date: { color: '#6b7a90', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#071936', fontSize: 34, lineHeight: 39, fontWeight: '900', marginTop: 8 },
  subtitle: { color: '#4a5a71', fontSize: 14, lineHeight: 20, marginTop: 8 },
  locationCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d8e2f1', borderRadius: 8, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { color: '#1f6feb', fontSize: 24 },
  daySelector: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dayButton: { flex: 1, height: 34, borderRadius: 7, borderWidth: 1, borderColor: '#d4ddea', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dayButtonActive: { backgroundColor: '#10233f', borderColor: '#10233f' },
  dayButtonText: { color: '#516177', fontSize: 11, fontWeight: '900' },
  dayButtonTextActive: { color: '#fff' },
  fill: { flex: 1 },
  locationName: { color: '#10233f', fontSize: 15, fontWeight: '800' },
  muted: { color: '#66768d', fontSize: 12, lineHeight: 17 },
  mutedCenter: { color: '#66768d', fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 270 },
  sectionHeader: { marginTop: 24, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  kicker: { color: '#0f7a3b', fontSize: 10, letterSpacing: 1, fontWeight: '900', marginBottom: 5 },
  sectionTitle: { color: '#071936', fontSize: 19, fontWeight: '900' },
  primarySmall: { backgroundColor: '#1677ff', borderRadius: 8, paddingHorizontal: 13, paddingVertical: 10 },
  primarySmallText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  form: { backgroundColor: '#eefaf1', borderWidth: 1, borderColor: '#b7e3c1', borderRadius: 8, padding: 12, gap: 9 },
  input: { backgroundColor: '#fff', borderColor: '#d4ddea', borderWidth: 1, borderRadius: 7, height: 42, paddingHorizontal: 11, color: '#10233f', fontSize: 13 },
  formRow: { flexDirection: 'row', gap: 9 },
  half: { flex: 1 },
  priorityRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  priority: { borderColor: '#b8c6d9', borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, height: 34, justifyContent: 'center', backgroundColor: '#fff' },
  priorityActive: { backgroundColor: '#10233f', borderColor: '#10233f' },
  priorityText: { color: '#42536a', fontSize: 12, fontWeight: '800' },
  priorityTextActive: { color: '#fff' },
  addButton: { backgroundColor: '#0f7a3b', borderRadius: 7, paddingHorizontal: 13, height: 34, justifyContent: 'center' },
  addButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  locationInput: { flex: 1, minWidth: 170 },
  taskList: { marginTop: 12, gap: 8 },
  taskCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dfe6ef', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  commitmentCard: { backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#cfe0ff', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyDayCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dfe6ef', borderRadius: 8, padding: 14, gap: 4 },
  classIcon: { width: 28, height: 28, borderRadius: 7, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  classIconText: { color: '#174ea6', fontSize: 12, fontWeight: '900' },
  fixedBadge: { color: '#174ea6', fontSize: 10, fontWeight: '900' },
  completeTask: { opacity: 0.55 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#9aa8bb', alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '900' },
  taskTitle: { color: '#10233f', fontSize: 14, fontWeight: '900' },
  place: { color: '#375f92', fontSize: 11, marginTop: 3 },
  tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  tagHigh: { backgroundColor: '#fee2e2' },
  tagMedium: { backgroundColor: '#fef3c7' },
  tagLow: { backgroundColor: '#dcfce7' },
  tagText: { color: '#21324a', fontSize: 10, fontWeight: '900' },
  planPanel: { marginTop: 24, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cfe0ff', borderRadius: 8, overflow: 'hidden' },
  panelTop: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#e6edf8', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  planBadge: { color: '#174ea6', fontSize: 10, fontWeight: '900' },
  emptyPlan: { alignItems: 'center', padding: 30, gap: 12 },
  emptyTitle: { color: '#10233f', fontSize: 16, fontWeight: '900' },
  primaryButton: { backgroundColor: '#1677ff', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12 },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  timeline: { padding: 15 },
  alert: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 8, padding: 11, flexDirection: 'row', gap: 10, marginBottom: 13 },
  alertIcon: { width: 22, height: 22, borderRadius: 11, color: '#fff', backgroundColor: '#f97316', textAlign: 'center', fontWeight: '900', lineHeight: 22 },
  alertTitle: { color: '#9a3412', fontWeight: '900', fontSize: 13 },
  alertText: { color: '#9a6a42', fontSize: 12, marginTop: 2 },
  routeRow: { flexDirection: 'row', minHeight: 68 },
  timeCol: { width: 48, alignItems: 'flex-end' },
  time: { color: '#071936', fontSize: 14, fontWeight: '900' },
  endTime: { color: '#7a8798', fontSize: 10, marginTop: 3 },
  rail: { width: 28, alignItems: 'center' },
  dot: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#22c55e', borderWidth: 3, borderColor: '#ddf8e6' },
  dotCommitment: { backgroundColor: '#0ea5e9', borderColor: '#d8f3ff' },
  dotMoved: { backgroundColor: '#f59e0b', borderColor: '#fff2c7' },
  line: { width: 2, flex: 1, backgroundColor: '#d4deec' },
  routeCard: { flex: 1, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#e1e9f5', borderRadius: 8, padding: 10, marginBottom: 10 },
  movedCard: { backgroundColor: '#fffbeb', borderColor: '#f5d384', borderStyle: 'dashed' },
  routeTitle: { color: '#10233f', fontSize: 14, fontWeight: '900', marginBottom: 3 },
  replanGrid: { flexDirection: 'row', gap: 9, marginTop: 4 },
  replanButton: { flex: 1, backgroundColor: '#eef4ff', borderWidth: 1, borderColor: '#cfe0ff', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  replanActive: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  replanText: { color: '#174ea6', fontSize: 12, fontWeight: '900' },
  summary: { marginTop: 24, backgroundColor: '#fff8f1', borderColor: '#fdba74', borderWidth: 1, borderRadius: 8, padding: 16, alignItems: 'center' },
  trophy: { fontSize: 27 },
  summaryTitle: { color: '#10233f', fontSize: 18, fontWeight: '900', marginTop: 6, marginBottom: 12 },
  summaryRow: { width: '100%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#f4dac2', borderRadius: 7, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 },
  summaryMetric: { color: '#0f7a3b', fontSize: 16, fontWeight: '900', width: 34, textAlign: 'right' },
  summaryText: { color: '#314158', fontSize: 13, fontWeight: '700' },
});
