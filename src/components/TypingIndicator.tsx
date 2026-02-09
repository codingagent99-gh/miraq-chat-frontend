import styles from "./TypingIndicator.module.css";

export default function TypingIndicator() {
  return (
    <div className={styles.row}>
      <div className={styles.avatar}>☕</div>
      <div className={styles.bubble}>
        <span className={`${styles.dot} ${styles.d1}`} />
        <span className={`${styles.dot} ${styles.d2}`} />
        <span className={`${styles.dot} ${styles.d3}`} />
      </div>
    </div>
  );
}
