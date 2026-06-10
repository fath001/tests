import Exam from "../models/Exam.js";
import Question from "../models/Question.js";

export const createQuestion = async (req, res) => {
  try {
    const { examId, question, options, correctAnswer, questionType = "multiple_choice" } = req.body;
    const exam = await Exam.findById(examId);

    if (!exam) {
      return res.status(404).json({ message: "Exam not found" });
    }

    const questionCount = await Question.countDocuments({ exam: examId });

    if (questionCount >= exam.totalQuestions) {
      return res.status(400).json({
        message: `This exam already has ${exam.totalQuestions} questions`,
      });
    }

    const normalizedOptions =
      questionType === "true_false"
        ? { A: "True", B: "False" }
        : {
            A: options?.A?.trim?.() || "",
            B: options?.B?.trim?.() || "",
            C: options?.C?.trim?.() || "",
            D: options?.D?.trim?.() || "",
          };

    if (!question?.trim()) {
      return res.status(400).json({ message: "Question text is required" });
    }

    if (!["A", "B", "C", "D"].includes(correctAnswer)) {
      return res.status(400).json({ message: "Invalid correct answer" });
    }

    if (questionType === "true_false") {
      if (!["A", "B"].includes(correctAnswer)) {
        return res.status(400).json({ message: "True / False questions must use True or False" });
      }
    } else {
      const missingOption = ["A", "B", "C", "D"].some((key) => !normalizedOptions[key]);
      if (missingOption) {
        return res.status(400).json({ message: "All four options are required for MCQ questions" });
      }
    }

    const newQuestion = await Question.create({
      exam: examId,
      question: question.trim(),
      questionType,
      options: normalizedOptions,
      correctAnswer,
      createdBy: req.user.id,
    });

    res.status(201).json(newQuestion);
  } catch (error) {
    res.status(500).json(error);
  }
};

export const getQuestions = async (req, res) => {
  try {
    const questions = await Question.find().populate("exam", "name totalQuestions");
    res.json(questions);
  } catch (error) {
    res.status(500).json(error);
  }
};

export const getQuestionsByExam = async (req, res) => {
  try {
    const questions = await Question.find({ exam: req.params.examId });
    res.json(questions);
  } catch (error) {
    res.status(500).json(error);
  }
};
