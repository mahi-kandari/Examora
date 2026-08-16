import { useEffect, useState } from "react";

/**
 * Live countdown to a given time on the exam day.
 *
 * `examDate` is an ISO date ("YYYY-MM-DD") and `timeStr` is a clock time such as
 * "06:45 AM". This is the exact logic used by the Success screen, shared here so
 * the Home banner and the ExamDetail Chronos card stay perfectly in sync with it.
 */
export function useCountdown(
  examDate: string | undefined,
  timeStr: string | undefined
) {
  const [remaining, setRemaining] = useState("--:--:--");

  useEffect(() => {
    if (!examDate || !timeStr) return;
    const [time, meridiem] = timeStr.split(" ");
    const [h, m] = time.split(":").map(Number);
    let hour24 = h % 12;
    if (meridiem === "PM") hour24 += 12;

    const deadline = new Date(
      `${examDate}T${String(hour24).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`
    );

    const tick = () => {
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();
      if (diff <= 0) {
        setRemaining("Time to leave!");
        return;
      }
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(
        `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      );
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [examDate, timeStr]);

  return remaining;
}
