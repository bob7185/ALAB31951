import express from "express";
import mongoose from "mongoose";

const router = express.Router();

const gradeSchema = new mongoose.Schema({
  class_id: { type: Number, required: true, min: 0, max: 300 },
  learner_id: { type: Number, required: true, min: 0 },
  scores: [
    {
      type: { type: String, required: true },
      score: { type: Number, required: true },
    },
  ],
});

const Grade = mongoose.model("Grade", gradeSchema);



// Get the weighted average of a specified learner's grades, per class
router.get("/learner/:id/avg-class", async (req, res) => {
  try {
    const learnerId = Number(req.params.id);
    const result = await Grade.aggregate([
      { $match: { learner_id: learnerId } },
      { $unwind: "$scores" },
      {
        $group: {
          _id: "$class_id",
          quiz: {
            $push: {
              $cond: [
                { $eq: ["$scores.type", "quiz"] },
                "$scores.score",
                "$$REMOVE",
              ],
            },
          },
          exam: {
            $push: {
              $cond: [
                { $eq: ["$scores.type", "exam"] },
                "$scores.score",
                "$$REMOVE",
              ],
            },
          },
          homework: {
            $push: {
              $cond: [
                { $eq: ["$scores.type", "homework"] },
                "$scores.score",
                "$$REMOVE",
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          class_id: "$_id",
          avg: {
            $sum: [
              { $multiply: [{ $avg: "$exam" }, 0.5] },
              { $multiply: [{ $avg: "$quiz" }, 0.3] },
              { $multiply: [{ $avg: "$homework" }, 0.2] },
            ],
          },
        },
      },
    ]);

    if (result.length === 0) return res.status(404).send("Not found");
    res.status(200).send(result);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Get statistics for all learners
router.get("/stats", async (req, res) => {
  try {
    const result = await Grade.aggregate([
      {
        $facet: {
          totalLearners: [{ $count: "count" }],
          learnersAbove70: [
            { $unwind: "$scores" },
            {
              $addFields: {
                weightedScore: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$scores.type", "exam"] }, then: { $multiply: ["$scores.score", 0.5] } },
                      { case: { $eq: ["$scores.type", "quiz"] }, then: { $multiply: ["$scores.score", 0.3] } },
                      { case: { $eq: ["$scores.type", "homework"] }, then: { $multiply: ["$scores.score", 0.2] } },
                    ],
                    default: 0,
                  },
                },
              },
            },
            {
              $group: {
                _id: "$learner_id",
                weightedAverage: { $sum: "$weightedScore" },
              },
            },
            { $match: { weightedAverage: { $gt: 70 } } },
            { $count: "count" },
          ],
        },
      },
      {
        $project: {
          totalLearners: { $arrayElemAt: ["$totalLearners.count", 0] },
          learnersAbove70: { $arrayElemAt: ["$learnersAbove70.count", 0] },
        },
      },
      {
        $addFields: {
          percentageAbove70: {
            $multiply: [
              { $divide: ["$learnersAbove70", "$totalLearners"] },
              100,
            ],
          },
        },
      },
    ]);

    res.status(200).send(result[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Get statistics for a specific class
router.get("/stats/:id", async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const result = await Grade.aggregate([
      { $match: { class_id: classId } },
      {
        $facet: {
          totalLearners: [{ $count: "count" }],
          learnersAbove70: [
            { $unwind: "$scores" },
            {
              $addFields: {
                weightedScore: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$scores.type", "exam"] }, then: { $multiply: ["$scores.score", 0.5] } },
                      { case: { $eq: ["$scores.type", "quiz"] }, then: { $multiply: ["$scores.score", 0.3] } },
                      { case: { $eq: ["$scores.type", "homework"] }, then: { $multiply: ["$scores.score", 0.2] } },
                    ],
                    default: 0,
                  },
                },
              },
            },
            {
              $group: {
                _id: "$learner_id",
                weightedAverage: { $sum: "$weightedScore" },
              },
            },
            { $match: { weightedAverage: { $gt: 70 } } },
            { $count: "count" },
          ],
        },
      },
      {
        $project: {
          totalLearners: { $arrayElemAt: ["$totalLearners.count", 0] },
          learnersAbove70: { $arrayElemAt: ["$learnersAbove70.count", 0] },
        },
      },
      {
        $addFields: {
          percentageAbove70: {
            $cond: [
              { $eq: ["$totalLearners", 0] },
              0,
              { $multiply: [
                { $divide: ["$learnersAbove70", "$totalLearners"] },
                100,
              ] },
            ],
          },
        },
      },
    ]);

    if (result.length === 0) {
      return res.status(404).send({
        totalLearners: 0,
        learnersAbove70: 0,
        percentageAbove70: 0,
      });
    }

    res.status(200).send(result[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

export default router;
