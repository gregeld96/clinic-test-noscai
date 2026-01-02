import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchServices, fetchDoctors, fetchAvailability, createBooking, fetchDoctorSchedule } from './api';
import { format, addDays, parseISO, startOfDay, endOfDay } from 'date-fns';
import { Clock, User, CheckCircle, AlertCircle, Calendar, PlusCircle, ChevronLeft, ChevronRight, Hash } from 'lucide-react';
import clsx from 'clsx';

function App() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'booking' | 'schedule'>('booking');
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [bookingResult, setBookingResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Queries
  const services = useQuery({ queryKey: ['services'], queryFn: fetchServices });
  const doctors = useQuery({ queryKey: ['doctors'], queryFn: fetchDoctors });

  const availability = useQuery({
    queryKey: ['availability', selectedService?.id, selectedDoctor, selectedDate],
    queryFn: () => fetchAvailability({
      service_id: selectedService?.id,
      doctor_ids: selectedDoctor ? [parseInt(selectedDoctor)] : undefined,
      from: startOfDay(new Date(selectedDate)).toISOString(),
      to: endOfDay(new Date(selectedDate)).toISOString()
    }),
    enabled: !!selectedService && step === 2 && view === 'booking'
  });

  const doctorSchedule = useQuery({
    queryKey: ['schedule', selectedDoctor, selectedDate],
    queryFn: () => fetchDoctorSchedule(parseInt(selectedDoctor), startOfDay(new Date(selectedDate)).toISOString(), endOfDay(new Date(selectedDate)).toISOString()),
    enabled: !!selectedDoctor && view === 'schedule'
  });

  // Mutation
  const bookMutation = useMutation({
    mutationFn: createBooking,
    onSuccess: (data) => {
      setBookingResult(data?.data);
      setStep(3);
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || 'Booking Failed');
    }
  });

  const handleBook = () => {
    setErrorMsg('');
    bookMutation.mutate({
      doctor_id: selectedSlot.doctor_id,
      service_id: selectedService.id,
      room_id: selectedSlot.room_id,
      patient_id: 1, // Hardcoded for demo
      starts_at: selectedSlot.start,
      device_ids: selectedSlot.device_ids
    });
  };

  const top3Slots = useMemo(() => {
    return availability.data?.data?.slots?.slice(0, 3) || [];
  }, [availability.data]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100">
      {/* Background blobs for premium feel */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-200/30 blur-[120px] rounded-full" />
        <div className="absolute top-[60%] -right-[10%] w-[35%] h-[40%] bg-indigo-200/30 blur-[120px] rounded-full" />
      </div>

      <header className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">NoscAi Health</h1>
          <p className="text-slate-500 font-medium">Clinic Management System</p>
        </div>

        <nav className="flex p-1 bg-white/60 backdrop-blur-md border border-white/40 shadow-sm rounded-full w-fit self-center md:self-auto">
          <button
            onClick={() => { setView('booking'); setStep(1); }}
            className={clsx(
              "px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 flex items-center gap-2",
              view === 'booking' ? "bg-white text-blue-700 shadow-md ring-1 ring-slate-100" : "text-slate-600 hover:text-slate-900"
            )}
          >
            <PlusCircle className="w-4 h-4" />
            New Booking
          </button>
          <button
            onClick={() => setView('schedule')}
            className={clsx(
              "px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 flex items-center gap-2",
              view === 'schedule' ? "bg-white text-blue-700 shadow-md ring-1 ring-slate-100" : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Calendar className="w-4 h-4" />
            Clinician Schedule
          </button>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-6 pb-20">
        <div className="relative">
          {/* Main Card */}
          <div className="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-3xl p-8 min-h-[500px]">

            {view === 'booking' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* Progress Indicators */}
                {step < 3 && (
                  <div className="flex items-center gap-4 mb-10 overflow-x-auto pb-2 scrollbar-hide">
                    {[1, 2, 3].map((s) => (
                      <div key={s} className="flex items-center gap-2 group">
                        <div className={clsx(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300",
                          step === s ? "bg-blue-600 text-white shadow-lg shadow-blue-200 scale-110" : step > s ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
                        )}>
                          {step > s ? <CheckCircle className="w-5 h-5 text-green-600" strokeWidth={3} /> : s}
                        </div>
                        <span className={clsx(
                          "text-sm font-semibold whitespace-nowrap transition-colors",
                          step === s ? "text-slate-900" : "text-slate-400"
                        )}>
                          {s === 1 ? 'Service' : s === 2 ? 'Time & Date' : 'Confirmation'}
                        </span>
                        {s < 3 && <div className="w-8 h-px bg-slate-200" />}
                      </div>
                    ))}
                  </div>
                )}

                {step === 1 && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 mb-2">Choose Treatment</h2>
                      <p className="text-slate-500 text-sm">Select the medical service you require from our catalog.</p>
                    </div>

                    <div className="grid gap-3">
                      {services.isLoading ? (
                        Array(3).fill(0).map((_, i) => <div key={i} className="h-16 bg-slate-50 animate-pulse rounded-2xl" />)
                      ) : (
                        services.data?.data?.map((svc: any) => (
                          <div key={svc.id}
                            onClick={() => setSelectedService(svc)}
                            className={clsx(
                              "group p-5 border-2 rounded-2xl cursor-pointer transition-all duration-300 flex items-center justify-between",
                              selectedService?.id === svc.id
                                ? "border-blue-600 bg-blue-50/50 shadow-inner"
                                : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-lg hover:shadow-slate-200/40"
                            )}>
                            <div className="flex items-center gap-4">
                              <div className={clsx(
                                "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                                selectedService?.id === svc.id ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-400 group-hover:bg-slate-100"
                              )}>
                                <Clock className="w-6 h-6" />
                              </div>
                              <div>
                                <h3 className="font-bold text-slate-900">{svc.name}</h3>
                                <p className="text-slate-500 text-sm font-medium">{svc.duration_min} minutes clinical time</p>
                              </div>
                            </div>
                            <div className={clsx(
                              "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                              selectedService?.id === svc.id ? "border-blue-600 bg-blue-600" : "border-slate-200"
                            )}>
                              {selectedService?.id === svc.id && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Preferred Specialist</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <select
                            className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-10 pr-4 text-slate-800 focus:ring-2 focus:ring-blue-500/20 font-medium transition-all appearance-none"
                            value={selectedDoctor}
                            onChange={(e) => setSelectedDoctor(e.target.value)}
                          >
                            <option value="">Any Specialist</option>
                            {doctors.data?.data?.map((doc: any) => (
                              <option key={doc.id} value={doc.id}>{doc.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Appointment Date</label>
                        <div className="relative">
                          <input
                            type="date"
                            className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-slate-800 focus:ring-2 focus:ring-blue-500/20 font-medium transition-all"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            min={format(new Date(), 'yyyy-MM-dd')}
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      disabled={!selectedService}
                      onClick={() => { setStep(2); setSelectedSlot(null); }}
                      className="w-full bg-blue-600 text-white py-4 rounded-2xl font-extrabold shadow-xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 transition-all disabled:opacity-30 disabled:translate-y-0"
                    >
                      Check Availability
                    </button>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-8">
                    <button onClick={() => setStep(1)} className="group flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-blue-600 transition-colors">
                      <ChevronLeft className="w-4 h-4" /> Go Back
                    </button>

                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 mb-2">Select Your Slot</h2>
                      <p className="text-slate-500 text-sm">Showing the next 3 available slots for <strong>{selectedService.name}</strong> on {format(new Date(selectedDate), 'MMMM do')}.</p>
                    </div>

                    {availability.isLoading && (
                      <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-12 h-12 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin" />
                        <p className="text-slate-400 font-bold animate-pulse text-sm uppercase tracking-widest">Scanning Schedule...</p>
                      </div>
                    )}

                    {!availability.isLoading && (
                      <div className="grid gap-4">
                        {top3Slots.length === 0 ? (
                          <div className="p-8 bg-amber-50 rounded-3xl text-center border border-amber-100 space-y-3">
                            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                              <AlertCircle className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="font-bold text-amber-900">No slots found</h3>
                              <p className="text-amber-700 text-sm">Please try another date or select a different specialist.</p>
                            </div>
                          </div>
                        ) : (
                          top3Slots.map((slot: any, idx: number) => {
                            const start = parseISO(slot.start);
                            const doctor = doctors.data?.data?.find((d: any) => d.id === slot.doctor_id);
                            return (
                              <div key={idx}
                                onClick={() => setSelectedSlot(slot)}
                                className={clsx(
                                  "group p-5 border-2 rounded-2xl cursor-pointer transition-all duration-300 flex items-center justify-between",
                                  selectedSlot === slot
                                    ? "border-blue-600 bg-blue-50 shadow-lg shadow-blue-100/50 scale-[1.02]"
                                    : "border-slate-50 bg-slate-50/50 hover:border-slate-200 hover:bg-white"
                                )}>
                                <div className="flex items-center gap-5">
                                  <div className={clsx(
                                    "px-4 py-2 rounded-xl text-lg font-black transition-colors",
                                    selectedSlot === slot ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white text-slate-700 group-hover:text-blue-600"
                                  )}>
                                    {format(start, 'HH:mm')}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <User className="w-3.5 h-3.5 text-slate-400" />
                                      <span className="font-bold text-slate-800 leading-none">{doctor?.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Hash className="w-3.5 h-3.5 text-slate-400" />
                                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{slot.room_name}</span>
                                    </div>
                                  </div>
                                </div>
                                <CheckCircle className={clsx(
                                  "w-6 h-6 transition-all",
                                  selectedSlot === slot ? "text-blue-600 scale-110 opacity-100" : "text-transparent scale-50 opacity-0"
                                )} strokeWidth={3} />
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {errorMsg && (
                      <div className="p-4 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm font-bold">{errorMsg}</span>
                      </div>
                    )}

                    <button
                      disabled={!selectedSlot || bookMutation.isPending}
                      onClick={handleBook}
                      className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-extrabold shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all disabled:opacity-30 disabled:translate-y-0"
                    >
                      {bookMutation.isPending ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          <span>Securing Appointment...</span>
                        </div>
                      ) : 'Confirm Booking'}
                    </button>
                  </div>
                )}

                {step === 3 && bookingResult && (
                  <div className="text-center py-12 animate-in zoom-in-95 duration-500">
                    <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-green-100 mb-8">
                      <CheckCircle className="w-12 h-12" strokeWidth={3} />
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 mb-3 text-balance">Appointment Confirmed!</h2>
                    <p className="text-slate-500 max-w-sm mx-auto font-medium mb-10">
                      Your visit is scheduled for <span className="text-slate-900 font-bold">{format(parseISO(bookingResult.starts_at), 'PPPP')}</span> at <span className="text-slate-900 font-bold">{format(parseISO(bookingResult.starts_at), 'HH:mm')}</span>.
                    </p>

                    <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 mb-10 text-left max-w-md mx-auto space-y-4">
                      <div className="flex justify-between items-center pb-4 border-b border-slate-200/60">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Booking ID</span>
                        <span className="text-sm font-mono font-bold text-slate-900">#{bookingResult.id}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Specialist</span>
                          <span className="text-sm font-bold text-slate-800">{doctors.data?.data?.find((d: any) => d.id === bookingResult.doctor_id)?.name}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Buffers</span>
                          <span className="text-sm font-bold text-slate-800">{bookingResult.buffer_before_min}m / {bookingResult.buffer_after_min}m</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => { setStep(1); setBookingResult(null); setSelectedSlot(null); }}
                      className="inline-flex items-center gap-2 px-10 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 hover:-translate-y-0.5 shadow-xl shadow-slate-200 transition-all active:translate-y-0"
                    >
                      Book Another Appointment
                    </button>
                  </div>
                )}
              </div>
            )}

            {view === 'schedule' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Clinician Schedule</h2>
                  <p className="text-slate-500 text-sm">Monitor physician availability and existing appointments.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Select Clinician</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-10 pr-4 text-slate-800 focus:ring-2 focus:ring-blue-500/20 font-medium transition-all appearance-none"
                        value={selectedDoctor}
                        onChange={(e) => setSelectedDoctor(e.target.value)}
                      >
                        <option value="">Choose a clinician</option>
                        {doctors.data?.data?.map((doc: any) => (
                          <option key={doc.id} value={doc.id}>{doc.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Schedule Date</label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), -1), 'yyyy-MM-dd'))} className="p-3 bg-white border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                        <ChevronLeft className="w-5 h-5 text-slate-600" />
                      </button>
                      <input
                        type="date"
                        className="flex-1 bg-slate-50 border-none rounded-2xl py-3 px-4 text-slate-800 focus:ring-2 focus:ring-blue-500/20 font-bold text-center transition-all"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                      />
                      <button onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 1), 'yyyy-MM-dd'))} className="p-3 bg-white border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                      </button>
                    </div>
                  </div>
                </div>

                {!selectedDoctor ? (
                  <div className="flex flex-col items-center justify-center py-20 grayscale opacity-40">
                    <Calendar className="w-16 h-16 text-slate-200 mb-4" />
                    <p className="font-bold text-slate-400">Select a clinician to view their schedule</p>
                  </div>
                ) : doctorSchedule.isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin" />
                    <p className="text-slate-400 font-bold animate-pulse text-sm uppercase tracking-widest">Loading Timeline...</p>
                  </div>
                ) : (
                  <div className="relative border-l-2 border-slate-100 ml-4 pl-8 space-y-6 pb-4">
                    {doctorSchedule.data?.data?.map((item: any, idx: number) => {
                      const start = parseISO(item.start);
                      const end = parseISO(item.end);
                      return (
                        <div key={idx} className="relative group">
                          {/* Timeline Dot */}
                          <div className={clsx(
                            "absolute -left-[41px] top-1.5 w-4 h-4 rounded-full border-4 border-white transition-all duration-300 z-10",
                            item.type === 'appointment' ? "bg-indigo-600 h-6 -translate-y-1" :
                              item.type === 'break' ? "bg-rose-500" :
                                item.type === 'available' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]" :
                                  "bg-slate-300"
                          )} />

                          <div className={clsx(
                            "p-5 rounded-2xl border transition-all duration-300",
                            item.type === 'appointment' ? "bg-indigo-50 border-indigo-100 shadow-lg shadow-indigo-100/40" :
                              item.type === 'break' ? "bg-rose-50 border-rose-100" :
                                item.type === 'available' ? "bg-white border-slate-100 hover:border-emerald-200" :
                                  "bg-slate-50 border-slate-100 opacity-60"
                          )}>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{format(start, 'HH:mm')} - {format(end, 'HH:mm')}</span>
                                  {item.type === 'appointment' && <span className="px-2 py-0.5 bg-indigo-600 text-white text-[8px] font-black uppercase rounded-full tracking-tighter">Reserved</span>}
                                  {item.type === 'break' && <span className="px-2 py-0.5 bg-rose-500 text-white text-[8px] font-black uppercase rounded-full tracking-tighter">On Break</span>}
                                  {item.type === 'closed' && <span className="px-2 py-0.5 bg-slate-400 text-white text-[8px] font-black uppercase rounded-full tracking-tighter">Closed</span>}
                                </div>
                                <h3 className={clsx("font-extrabold text-lg", item.type === 'appointment' ? "text-indigo-900" : "text-slate-800")}>
                                  {item.type === 'appointment' ? (item.description || 'Consultation') :
                                    item.type === 'break' ? 'Physician Break' :
                                      item.type === 'available' ? 'Accepting Appointments' :
                                        'Clinic Closed'}
                                </h3>
                                {item.type === 'appointment' && (
                                  <div className="flex items-center gap-3 text-xs font-bold text-slate-500 mt-2">
                                    <div className="flex items-center gap-1">
                                      <Hash className="w-3.5 h-3.5" />
                                      {item.metadata?.room_name || 'Room 1'}
                                    </div>
                                    {item.metadata?.patient_name && (
                                      <div className="flex items-center gap-1">
                                        <User className="w-3.5 h-3.5" />
                                        {item.metadata?.patient_name}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {item.type === 'available' && (
                                <button
                                  onClick={() => { setView('booking'); setSelectedDate(format(start, 'yyyy-MM-dd')); }}
                                  className="px-6 py-2 bg-emerald-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
                                >
                                  Book This Block
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Bottom Shadow Decoration */}
          <div className="absolute -bottom-6 left-[10%] right-[10%] h-12 bg-slate-900/5 blur-2xl rounded-full -z-10" />
        </div>
      </main>

      <footer className="max-w-4xl mx-auto px-6 text-center text-slate-400 py-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em]">Powered by NoscAi Practice Intelligence &copy; 2026</p>
      </footer>
    </div>
  );
}

export default App;
