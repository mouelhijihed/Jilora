ALTER TABLE workout_template_days
    DROP CONSTRAINT IF EXISTS workout_template_days_workout_type_check;
ALTER TABLE workout_template_days
    ADD CONSTRAINT workout_template_days_workout_type_check
    CHECK (workout_type IN ('Strength','Push','Pull','Legs','Upper','Lower','Full Body','Cardio','Running','Swimming','Cycling','Boxing','Taekwondo','Football','Calisthenics','Weightlifting','Other','Rest'));

ALTER TABLE scheduled_workouts
    DROP CONSTRAINT IF EXISTS scheduled_workouts_workout_type_check;
ALTER TABLE scheduled_workouts
    ADD CONSTRAINT scheduled_workouts_workout_type_check
    CHECK (workout_type IN ('Strength','Push','Pull','Legs','Upper','Lower','Full Body','Cardio','Running','Swimming','Cycling','Boxing','Taekwondo','Football','Calisthenics','Weightlifting','Other','Rest'));
